import type { EvaluatedAccount } from '../answer';
import type { RiskLevel, Segment, SignalType } from '../domain';

/**
 * Leadership roll-ups. PURE functions over the already-evaluated book — no UI, no
 * data-source or vendor deps, no mutation of the signal engine. This is the
 * "compute it automatically" layer that replaces the manual Salesforce reports:
 * every number here is derived from our normalized model + fired signals, never
 * from a CRM field the customer may not maintain.
 */

export interface LeadershipConfig {
  /** No touchpoint in this many days = an engagement-coverage gap. */
  coverageStaleDays: number;
  /** Modeled expansion uplift applied to a growth-signal account's ARR. */
  expansionUpliftPct: number;
}

export const DEFAULT_LEADERSHIP_CONFIG: LeadershipConfig = {
  coverageStaleDays: 30,
  expansionUpliftPct: 0.25,
};

// ---- helpers --------------------------------------------------------------

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 1000) / 10;
}

function lastTouch(e: EvaluatedAccount): number | null {
  const times: number[] = [];
  for (const c of e.account.contacts ?? []) {
    if (c.lastContactedAt) {
      const ms = Date.parse(c.lastContactedAt);
      if (!Number.isNaN(ms)) times.push(ms);
    }
  }
  for (const i of e.account.interactions ?? []) {
    const ms = Date.parse(i.occurredAt);
    if (!Number.isNaN(ms)) times.push(ms);
  }
  return times.length ? Math.max(...times) : null;
}

function daysSinceTouch(e: EvaluatedAccount, now: Date): number | null {
  const t = lastTouch(e);
  return t === null ? null : Math.floor((now.getTime() - t) / 86_400_000);
}

function daysToRenewal(e: EvaluatedAccount, now: Date): number | null {
  const ms = Date.parse(e.account.renewalDate);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - now.getTime()) / 86_400_000);
}

function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// ---- revenue retention ----------------------------------------------------

export interface RetentionMetrics {
  nrrPct: number;
  grrPct: number;
  currentArr: number;
  priorArr: number;
}

/**
 * NRR = current ARR / prior ARR (includes expansion & contraction & churn).
 * GRR = retained ARR (capped at prior, so expansion can't mask churn) / prior ARR.
 * Computed only over accounts that existed a cycle ago (priorArr > 0).
 */
export function retention(book: EvaluatedAccount[]): RetentionMetrics {
  const cohort = book.filter((e) => e.account.priorArr > 0);
  const prior = cohort.reduce((s, e) => s + e.account.priorArr, 0);
  const current = cohort.reduce((s, e) => s + e.account.arr, 0);
  const retained = cohort.reduce((s, e) => s + Math.min(e.account.arr, e.account.priorArr), 0);
  return { nrrPct: pct(current, prior), grrPct: pct(retained, prior), currentArr: current, priorArr: prior };
}

// ---- portfolio distribution ----------------------------------------------

export interface HealthBucket {
  count: number;
  arr: number;
}
export type HealthDistribution = Record<RiskLevel, HealthBucket>;

export function distribution(book: EvaluatedAccount[]): HealthDistribution {
  const empty = (): HealthBucket => ({ count: 0, arr: 0 });
  const out: HealthDistribution = { green: empty(), yellow: empty(), red: empty() };
  for (const e of book) {
    const b = out[e.evaluation.riskLevel];
    b.count += 1;
    b.arr += e.account.arr;
  }
  return out;
}

export function arrAtRisk(book: EvaluatedAccount[]): number {
  return book.filter((e) => e.evaluation.riskLevel === 'red').reduce((s, e) => s + e.account.arr, 0);
}

export function totalArr(book: EvaluatedAccount[]): number {
  return book.reduce((s, e) => s + e.account.arr, 0);
}

// ---- coverage & team ------------------------------------------------------

export interface CoverageRow {
  id: string;
  name: string;
  ownerCsm: string;
  arr: number;
  riskLevel: RiskLevel;
  daysSinceTouch: number | null;
}

/** Accounts with no touchpoint within the coverage window — the blind spots. */
export function engagementCoverageGaps(
  book: EvaluatedAccount[],
  now: Date,
  config: LeadershipConfig = DEFAULT_LEADERSHIP_CONFIG,
): CoverageRow[] {
  return book
    .map((e) => ({
      id: e.account.id, name: e.account.name, ownerCsm: e.account.ownerCsm, arr: e.account.arr,
      riskLevel: e.evaluation.riskLevel, daysSinceTouch: daysSinceTouch(e, now),
    }))
    .filter((r) => r.daysSinceTouch === null || r.daysSinceTouch > config.coverageStaleDays)
    .sort((a, b) => (b.daysSinceTouch ?? Infinity) - (a.daysSinceTouch ?? Infinity));
}

/**
 * The single most valuable leadership tile: at-risk (red) accounts with NO recent
 * CSM activity — where the team is dropping the ball. Framed as coverage, not blame.
 */
export function atRiskWithoutActivity(
  book: EvaluatedAccount[],
  now: Date,
  config: LeadershipConfig = DEFAULT_LEADERSHIP_CONFIG,
): CoverageRow[] {
  return engagementCoverageGaps(book, now, config)
    .filter((r) => r.riskLevel === 'red')
    .sort((a, b) => b.arr - a.arr);
}

export interface CsmWorkload {
  ownerCsm: string;
  accounts: number;
  arr: number;
  redAccounts: number;
  redArr: number;
}

/** Book balance by CSM — who is carrying the most accounts and the most at-risk ARR. */
export function workloadByCsm(book: EvaluatedAccount[]): CsmWorkload[] {
  const map = new Map<string, CsmWorkload>();
  for (const e of book) {
    const key = e.account.ownerCsm || 'Unassigned';
    const row = map.get(key) ?? { ownerCsm: key, accounts: 0, arr: 0, redAccounts: 0, redArr: 0 };
    row.accounts += 1;
    row.arr += e.account.arr;
    if (e.evaluation.riskLevel === 'red') {
      row.redAccounts += 1;
      row.redArr += e.account.arr;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.arr - a.arr);
}

// ---- expansion pipeline ---------------------------------------------------

export interface ExpansionRow {
  id: string;
  name: string;
  segment: Segment;
  arr: number;
  potentialArr: number;
}

/** Accounts flashing a growth signal, sized by modeled expansion uplift. */
export function expansionPipeline(
  book: EvaluatedAccount[],
  config: LeadershipConfig = DEFAULT_LEADERSHIP_CONFIG,
): ExpansionRow[] {
  return book
    .filter((e) => e.evaluation.signals.some((s) => s.type === 'growth_opportunity'))
    .map((e) => ({
      id: e.account.id, name: e.account.name, segment: e.account.segment, arr: e.account.arr,
      potentialArr: Math.round(e.account.arr * config.expansionUpliftPct),
    }))
    .sort((a, b) => b.potentialArr - a.potentialArr);
}

// ---- quarterly renewals ---------------------------------------------------

export interface RenewalRow {
  id: string;
  name: string;
  arr: number;
  riskLevel: RiskLevel;
  daysToRenewal: number;
  quarter: string;
  /** Fired risk signals, so a leader sees the "why" inline. */
  reasons: { type: SignalType; headline: string }[];
  jeopardyScore: number;
}

export interface QuarterGroup {
  quarter: string;
  renewals: RenewalRow[];
  renewingArr: number;
  arrAtRisk: number;
  redCount: number;
}

function jeopardyOf(e: EvaluatedAccount): number {
  const renewal = e.evaluation.signals.find((s) => s.type === 'renewal_risk');
  const raw = renewal?.evidence.jeopardyScore;
  if (typeof raw === 'number') return raw;
  return e.evaluation.riskLevel === 'red' ? 60 : e.evaluation.riskLevel === 'yellow' ? 30 : 0;
}

/** Upcoming renewals grouped by quarter, each sorted by risk × dollars. */
export function quarterlyRenewals(book: EvaluatedAccount[], now: Date): QuarterGroup[] {
  const rows: RenewalRow[] = [];
  for (const e of book) {
    const days = daysToRenewal(e, now);
    if (days === null || days < 0) continue; // only upcoming
    const ms = Date.parse(e.account.renewalDate);
    rows.push({
      id: e.account.id, name: e.account.name, arr: e.account.arr, riskLevel: e.evaluation.riskLevel,
      daysToRenewal: days, quarter: quarterKey(new Date(ms)),
      reasons: e.evaluation.signals
        .filter((s) => s.polarity === 'risk')
        .map((s) => ({ type: s.type, headline: s.headline })),
      jeopardyScore: jeopardyOf(e),
    });
  }

  const byQuarter = new Map<string, RenewalRow[]>();
  for (const r of rows) {
    const list = byQuarter.get(r.quarter) ?? [];
    list.push(r);
    byQuarter.set(r.quarter, list);
  }

  const riskWeight: Record<RiskLevel, number> = { red: 2, yellow: 1, green: 0 };
  return [...byQuarter.entries()]
    .map(([quarter, renewals]) => {
      renewals.sort((a, b) => riskWeight[b.riskLevel] * b.arr - riskWeight[a.riskLevel] * a.arr);
      return {
        quarter,
        renewals,
        renewingArr: renewals.reduce((s, r) => s + r.arr, 0),
        arrAtRisk: renewals.filter((r) => r.riskLevel === 'red').reduce((s, r) => s + r.arr, 0),
        redCount: renewals.filter((r) => r.riskLevel === 'red').length,
      };
    })
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

// ---- churn reasons (inferred from fired signals, NOT a CRM picklist) -------

export interface ChurnReason {
  type: SignalType;
  label: string;
  accounts: number;
  arr: number;
}

const REASON_LABELS: Partial<Record<SignalType, string>> = {
  usage_decline: 'Usage decline',
  adoption_gap: 'Low adoption',
  champion_silence: 'Champion silence',
  renewal_risk: 'Renewal jeopardy',
  support_strain: 'Support strain',
  engagement_cadence: 'Engagement drop',
  email_responsiveness: 'Going unresponsive',
  feature_depth: 'Feature abandonment',
  stickiness_decline: 'Stickiness decline',
  onboarding_stalled: 'Onboarding stalled',
  billing_friction: 'Billing friction',
  sentiment_decline: 'Negative sentiment',
  champion_disengaging: 'Champion disengaging',
  sponsor_disengagement: 'Sponsor disengaging',
  competitor_mention: 'Competitor pressure',
  support_sentiment: 'Support frustration',
};

/** Why accounts are at risk, categorized from the signals that actually fired. */
export function churnReasonsByCategory(book: EvaluatedAccount[]): ChurnReason[] {
  const map = new Map<SignalType, ChurnReason>();
  for (const e of book) {
    if (e.evaluation.riskLevel === 'green') continue;
    for (const s of e.evaluation.signals) {
      if (s.polarity !== 'risk') continue;
      const row = map.get(s.type) ?? { type: s.type, label: REASON_LABELS[s.type] ?? s.type, accounts: 0, arr: 0 };
      row.accounts += 1;
      row.arr += e.account.arr;
      map.set(s.type, row);
    }
  }
  return [...map.values()].sort((a, b) => b.arr - a.arr);
}

// ---- segment / cohort breakdowns -----------------------------------------

export interface SegmentRetention {
  segment: Segment;
  nrrPct: number;
  grrPct: number;
  arr: number;
}

export function retentionBySegment(book: EvaluatedAccount[]): SegmentRetention[] {
  const segments: Segment[] = ['enterprise', 'mid_market', 'smb'];
  return segments.map((segment) => {
    const sub = book.filter((e) => e.account.segment === segment);
    const r = retention(sub);
    return { segment, nrrPct: r.nrrPct, grrPct: r.grrPct, arr: totalArr(sub) };
  });
}

export interface CsmHealth {
  ownerCsm: string;
  distribution: HealthDistribution;
}

export function healthByCsm(book: EvaluatedAccount[]): CsmHealth[] {
  const map = new Map<string, EvaluatedAccount[]>();
  for (const e of book) {
    const key = e.account.ownerCsm || 'Unassigned';
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([ownerCsm, list]) => ({ ownerCsm, distribution: distribution(list) }))
    .sort((a, b) => a.ownerCsm.localeCompare(b.ownerCsm));
}

// ---- the whole leadership snapshot ---------------------------------------

export interface LeadershipSnapshot {
  retention: RetentionMetrics;
  distribution: HealthDistribution;
  totalArr: number;
  arrAtRisk: number;
  coverageGaps: CoverageRow[];
  atRiskNoActivity: CoverageRow[];
  workload: CsmWorkload[];
  expansion: ExpansionRow[];
  quarterlyRenewals: QuarterGroup[];
  churnReasons: ChurnReason[];
  retentionBySegment: SegmentRetention[];
  healthByCsm: CsmHealth[];
}

export function leadershipSnapshot(
  book: EvaluatedAccount[],
  now: Date,
  config: LeadershipConfig = DEFAULT_LEADERSHIP_CONFIG,
): LeadershipSnapshot {
  return {
    retention: retention(book),
    distribution: distribution(book),
    totalArr: totalArr(book),
    arrAtRisk: arrAtRisk(book),
    coverageGaps: engagementCoverageGaps(book, now, config),
    atRiskNoActivity: atRiskWithoutActivity(book, now, config),
    workload: workloadByCsm(book),
    expansion: expansionPipeline(book, config),
    quarterlyRenewals: quarterlyRenewals(book, now),
    churnReasons: churnReasonsByCategory(book),
    retentionBySegment: retentionBySegment(book),
    healthByCsm: healthByCsm(book),
  };
}
