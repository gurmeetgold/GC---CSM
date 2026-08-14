import type {
  Account,
  BillingFlags,
  Contact,
  CrmOpportunity,
  EngagementLevel,
  FeatureUsage,
  Interaction,
  LifecycleState,
  ResponsivenessSnapshot,
  Segment,
  SupportTicket,
  TicketSeverity,
  TicketTone,
  SlaStatus,
  UsageSnapshot,
} from '../../domain';
import { daysAgo, daysAhead } from './referenceTime';

/**
 * Deterministic mock accounts, each engineered to exercise specific branches of the
 * signal engine (hard + soft) and to make the leadership roll-ups realistic. The
 * `expected` comment beside each is the HARD-signal risk level asserted by
 * mockAccounts.test.ts (soft signals are folded in by the pipeline, tested there).
 *
 * Every field the live adapter will populate is populated here too, so the two
 * sources stay shape-identical (the contract test proves it).
 */

const CSMS = ['Maya Chen', 'Devin Park', 'Rosa Alvarez', 'Tom Becker'] as const;

// --- builder ---------------------------------------------------------------

interface CadenceSpec {
  /** call/meeting touchpoints in the prior 60–120d window and the recent 0–60d window. */
  priorTouchpoints: number;
  recentTouchpoints: number;
}
interface FeatureSpec {
  label: string;
  isKeyFeature: boolean;
  prior: number;
  recent: number;
}

interface Spec {
  id: string;
  name: string;
  segment: Segment;
  arr: number;
  renewalInDays: number;
  seats: number;
  active: number;
  /** activeUsers at [120d, 90d, 60d, 30d] ago; omit for thin/empty history. */
  usage?: number[];
  /** logins parallel to `usage` (enables the stickiness signal). */
  logins?: number[];
  championLastContactDays: number | null;
  hasChampion?: boolean;
  openTickets?: number;
  criticalTickets?: number;
  createdDaysAgo?: number;
  interactionSummaries?: { text: string; kind?: Interaction['kind'] }[];
  // Phase 3 signal inputs
  cadence?: CadenceSpec;
  responsiveness?: ResponsivenessSnapshot[];
  features?: FeatureSpec[];
  activatedDaysAgo?: number | null;
  billing?: Partial<BillingFlags>;
  // Leadership inputs
  ownerCsm?: string;
  priorArr?: number;
  lifecycleState?: LifecycleState;
  /** Recency of general CSM activity (interactions + secondary contact). Default 7. */
  lastTouchDays?: number;
  // Phase 4 inputs
  /** Explicit ticket detail (help desk). If omitted, generic tickets match the counts. */
  ticketDetail?: { subject: string; severity: TicketSeverity; slaStatus: SlaStatus; tone: TicketTone; ageDays: number }[];
  /** A real CRM expansion opportunity amount, when one exists. */
  expansionOppArr?: number;
  /** Champion engagement override (else derived from contact recency). */
  championEngagement?: EngagementLevel;
  /** Force an empty trend series (cold-start / thin data → no sparkline). Default: derived. */
  noTrend?: boolean;
}

function usageFrom(spec: Spec): UsageSnapshot[] {
  if (!spec.usage || spec.usage.length === 0) return [];
  const offsets = [120, 90, 60, 30];
  return spec.usage.map((activeUsers, i) => {
    const snap: UsageSnapshot = { asOf: daysAgo(offsets[i] ?? 30 - i * 10), activeUsers };
    if (spec.logins && typeof spec.logins[i] === 'number') snap.logins = spec.logins[i];
    return snap;
  });
}

/** Derive engagement from contact recency (Gong/email proxy): recent = high, stale = low. */
function engagementFromDays(days: number | null): EngagementLevel {
  if (days === null) return 'low';
  if (days <= 20) return 'high';
  if (days <= 45) return 'medium';
  return 'low';
}

function contactsFrom(spec: Spec): Contact[] {
  const hasChampion = spec.hasChampion ?? true;
  const champion: Contact[] = hasChampion
    ? [
        {
          id: `${spec.id}-champ`,
          name: championNames[spec.id] ?? 'Alex Rivera',
          title: 'VP of Operations',
          isChampion: true,
          lastContactedAt:
            spec.championLastContactDays === null ? null : daysAgo(spec.championLastContactDays ?? 15),
          engagement: spec.championEngagement ?? engagementFromDays(spec.championLastContactDays ?? 15),
        },
      ]
    : [];
  const secondary: Contact = {
    id: `${spec.id}-user`,
    name: 'Jordan Lee',
    title: 'Program Manager',
    isChampion: false,
    lastContactedAt: daysAgo(spec.lastTouchDays ?? 7),
    engagement: engagementFromDays(spec.lastTouchDays ?? 7),
  };
  return [...champion, secondary];
}

const TICKET_SUBJECTS = [
  'Login issue for a user', 'Question about reporting export', 'Permission change request',
  'SSO configuration help', 'Data import question', 'Billing question',
];

/** Generate help-desk tickets. Explicit detail when provided, else generic ones matching the counts. */
function ticketsFrom(spec: Spec): SupportTicket[] {
  if (spec.ticketDetail) {
    return spec.ticketDetail.map((t, i) => ({
      id: `${spec.id}-tkt-${i}`,
      subject: t.subject,
      severity: t.severity,
      openedAt: daysAgo(t.ageDays),
      resolved: false,
      slaStatus: t.slaStatus,
      tone: t.tone,
    }));
  }
  const open = spec.openTickets ?? 1;
  const critical = spec.criticalTickets ?? 0;
  const out: SupportTicket[] = [];
  for (let i = 0; i < open; i++) {
    const isCrit = i < critical;
    out.push({
      id: `${spec.id}-tkt-${i}`,
      subject: TICKET_SUBJECTS[i % TICKET_SUBJECTS.length]!,
      severity: isCrit ? 'p1' : i % 3 === 0 ? 'p2' : 'p3',
      openedAt: daysAgo(2 + (i % 9)),
      resolved: false,
      slaStatus: isCrit ? 'at_risk' : 'ok',
      tone: 'neutral',
    });
  }
  return out;
}

function opportunitiesFrom(spec: Spec): CrmOpportunity[] {
  if (!spec.expansionOppArr) return [];
  return [{
    id: `${spec.id}-opp`,
    name: `${spec.name} — Expansion`,
    amount: spec.expansionOppArr,
    stage: 'qualified',
    isExpansion: true,
  }];
}

/**
 * A modeled 12-point trend series (0–100) for sparklines. Direction follows the
 * account's trajectory. Empty for cold-start / thin-data accounts (no usage history
 * or very new), which therefore render NO sparkline — honesty over decoration.
 */
function trendFrom(spec: Spec): number[] {
  const created = spec.createdDaysAgo ?? 500;
  const thin = spec.noTrend || (spec.usage?.length ?? 0) === 0 || created < 40;
  if (thin) return [];
  // Direction: reds decline, growth rises, else gently steady with small noise.
  const first = spec.usage?.[0] ?? 60;
  const last = spec.active ?? first;
  const slope = last >= first ? 1 : -1;
  const base = 62;
  const amp = slope > 0 ? 1 : -1;
  const pts: number[] = [];
  for (let i = 0; i < 12; i++) {
    const drift = amp * i * 2.2;
    const noise = ((i * 37) % 7) - 3; // deterministic small wobble
    pts.push(Math.max(8, Math.min(98, Math.round(base + drift + noise))));
  }
  return pts;
}

function interactionsFrom(spec: Spec): Interaction[] {
  const out: Interaction[] = [];
  // Cadence-driven call touchpoints, placed in the prior (60–120d) and recent (0–60d) windows.
  if (spec.cadence) {
    for (let i = 0; i < spec.cadence.priorTouchpoints; i++) {
      out.push({ id: `${spec.id}-cad-p${i}`, occurredAt: daysAgo(70 + i * 10), kind: 'call', summary: 'Recurring check-in call.' });
    }
    for (let i = 0; i < spec.cadence.recentTouchpoints; i++) {
      out.push({ id: `${spec.id}-cad-r${i}`, occurredAt: daysAgo(15 + i * 15), kind: 'call', summary: 'Recent check-in call.' });
    }
  }
  // Summary interactions (default kind rotates but avoids call so it won't skew cadence).
  const start = spec.lastTouchDays ?? 7;
  const summaries = spec.interactionSummaries ?? [];
  summaries.forEach((s, i) => {
    out.push({
      id: `${spec.id}-int-${i}`,
      occurredAt: daysAgo(start + i * 14),
      kind: s.kind ?? (i % 2 === 0 ? 'meeting' : 'email'),
      summary: s.text,
    });
  });
  return out;
}

function featuresFrom(spec: Spec): FeatureUsage[] {
  if (!spec.features) return [];
  return spec.features.map((f, i) => ({
    key: `${spec.id}-feat-${i}`,
    label: f.label,
    isKeyFeature: f.isKeyFeature,
    history: [
      { asOf: daysAgo(90), uses: f.prior },
      { asOf: daysAgo(20), uses: f.recent },
    ],
  }));
}

const championNames: Record<string, string> = {
  contosopharma: 'Priya Nair',
  bestforyou: 'Marcus Bell',
  vanarsdel: 'Dana Whitfield',
  relecloud: 'Sofia Marin',
};

function build(spec: Spec, index: number): Account {
  const createdDaysAgo = spec.createdDaysAgo ?? 500;
  const activatedAt =
    spec.activatedDaysAgo === null
      ? null
      : spec.activatedDaysAgo !== undefined
        ? daysAgo(spec.activatedDaysAgo)
        : daysAgo(Math.max(1, createdDaysAgo - 10)); // default: activated shortly after signup
  return {
    id: spec.id,
    name: spec.name,
    segment: spec.segment,
    arr: spec.arr,
    renewalDate: daysAhead(spec.renewalInDays),
    licensedSeats: spec.seats,
    activeUsers: spec.active,
    usageHistory: usageFrom(spec),
    contacts: contactsFrom(spec),
    interactions: interactionsFrom(spec),
    openTickets: spec.openTickets ?? 1,
    criticalTickets: spec.criticalTickets ?? 0,
    createdAt: daysAgo(createdDaysAgo),
    responsiveness: spec.responsiveness ?? [],
    featureUsage: featuresFrom(spec),
    activatedAt,
    billingFlags: {
      overdueInvoice: spec.billing?.overdueInvoice ?? false,
      disputedInvoice: spec.billing?.disputedInvoice ?? false,
      pricingPushback: spec.billing?.pricingPushback ?? false,
    },
    ownerCsm: spec.ownerCsm ?? CSMS[index % CSMS.length]!,
    priorArr: spec.priorArr ?? spec.arr,
    lifecycleState: spec.lifecycleState ?? 'active',
    tickets: ticketsFrom(spec),
    opportunities: opportunitiesFrom(spec),
    trendSeries: trendFrom(spec),
  };
}

// --- the book of business --------------------------------------------------

const SPECS: Spec[] = [
  // ---- Healthy greens ----
  {
    id: 'northwind', name: 'Northwind Traders', segment: 'enterprise', arr: 480_000, priorArr: 450_000,
    renewalInDays: 240, seats: 200, active: 150, usage: [140, 145, 148, 150],
    championLastContactDays: 10, openTickets: 3, ownerCsm: 'Maya Chen',
    interactionSummaries: [{ text: 'QBR went well; expanding to a new region next quarter.' }, { text: 'Champion confirmed strong internal adoption.' }],
  }, // green
  {
    id: 'contoso', name: 'Contoso Ltd', segment: 'mid_market', arr: 96_000,
    renewalInDays: 180, seats: 80, active: 60, usage: [58, 59, 60, 60],
    championLastContactDays: 20, openTickets: 2, ownerCsm: 'Devin Park',
    interactionSummaries: [{ text: 'Routine check-in, no concerns raised.' }],
  }, // green
  {
    id: 'fabrikam', name: 'Fabrikam Inc', segment: 'enterprise', arr: 300_000,
    renewalInDays: 300, seats: 120, active: 88, usage: [85, 86, 87, 88],
    championLastContactDays: 15, openTickets: 1, ownerCsm: 'Devin Park',
    interactionSummaries: [{ text: 'Team trained on new reporting module.' }],
  }, // green
  {
    id: 'tailspin', name: 'Tailspin Toys', segment: 'smb', arr: 24_000,
    renewalInDays: 150, seats: 25, active: 18, usage: [17, 17, 18, 18],
    championLastContactDays: 30, openTickets: 0, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Support resolved a minor billing question.' }],
  }, // green
  {
    id: 'schooloffine', name: 'School of Fine Art', segment: 'smb', arr: 22_000,
    renewalInDays: 130, seats: 20, active: 15, usage: [14, 14, 15, 15],
    championLastContactDays: 22, openTickets: 1, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Renewed enthusiasm after onboarding refresh.' }],
  }, // green
  {
    id: 'worldwide', name: 'World Wide Importers', segment: 'enterprise', arr: 420_000,
    renewalInDays: 280, seats: 250, active: 180, usage: [175, 178, 179, 180],
    championLastContactDays: 14, openTickets: 4, ownerCsm: 'Maya Chen',
    interactionSummaries: [{ text: 'Executive sponsor reaffirmed multi-year commitment.' }],
  }, // green
  {
    id: 'wideworld', name: 'Wide World Traders', segment: 'mid_market', arr: 78_000,
    renewalInDays: 175, seats: 55, active: 30, usage: [29, 30, 30, 30],
    championLastContactDays: 40, openTickets: 5, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Adoption steady near the healthy floor; watch utilization.' }],
  }, // green (54.5% adoption, just above the floor)

  // ---- Renewal-proximate but healthy: proximity alone must NOT read as risk ----
  {
    id: 'humongous', name: 'Humongous Insurance', segment: 'enterprise', arr: 340_000,
    renewalInDays: 50, seats: 140, active: 110, usage: [106, 108, 109, 110],
    championLastContactDays: 30, openTickets: 3, ownerCsm: 'Devin Park',
    interactionSummaries: [{ text: 'Renewal paperwork in motion; account healthy.' }],
  }, // green

  // ---- Expansion / growth opportunities (green risk + growth signal) ----
  {
    id: 'adventureworks', name: 'Adventure Works', segment: 'mid_market', arr: 120_000, priorArr: 95_000,
    renewalInDays: 200, seats: 100, active: 96, usage: [80, 85, 90, 96], lifecycleState: 'expanding',
    championLastContactDays: 12, openTickets: 1, ownerCsm: 'Rosa Alvarez', expansionOppArr: 30_000,
    interactionSummaries: [{ text: 'Usage climbing fast; asked about additional seats and pricing to expand.' }, { text: 'New team onboarded in the marketing org.' }],
  }, // green + growth
  {
    id: 'wingtip', name: 'Wingtip Toys', segment: 'enterprise', arr: 360_000, priorArr: 300_000,
    renewalInDays: 220, seats: 150, active: 150, usage: [120, 130, 140, 150], lifecycleState: 'expanding',
    championLastContactDays: 8, openTickets: 2, ownerCsm: 'Rosa Alvarez', expansionOppArr: 90_000,
    interactionSummaries: [{ text: 'At seat capacity — wants to expand, two new departments requesting access.' }],
  }, // green + growth (at limit)
  {
    id: 'coho', name: 'Coho Vineyard', segment: 'smb', arr: 26_000, priorArr: 20_000,
    renewalInDays: 100, seats: 25, active: 23, usage: [18, 20, 22, 23], lifecycleState: 'expanding',
    championLastContactDays: 16, openTickets: 0, ownerCsm: 'Rosa Alvarez', expansionOppArr: 7_000,
    interactionSummaries: [{ text: 'Power users pushing near the seat ceiling.' }],
  }, // green + growth

  // ---- Single-weak-signal yellows ----
  {
    id: 'proseware', name: 'Proseware Inc', segment: 'mid_market', arr: 72_000,
    renewalInDays: 190, seats: 100, active: 42, usage: [44, 44, 43, 42],
    championLastContactDays: 20, openTickets: 2, ownerCsm: 'Rosa Alvarez',
    interactionSummaries: [{ text: 'Only part of the org has rolled out; adoption stalling.' }],
  }, // yellow (adoption gap only)
  {
    id: 'litware', name: 'Litware Inc', segment: 'smb', arr: 30_000,
    renewalInDays: 160, seats: 40, active: 28, usage: [27, 27, 28, 28],
    championLastContactDays: 60, openTickets: 1, ownerCsm: 'Tom Becker', lastTouchDays: 58,
    interactionSummaries: [{ text: 'Champion has gone quiet since the reorg.' }],
  }, // yellow (champion silence only)
  {
    id: 'fourthcoffee', name: 'Fourth Coffee', segment: 'smb', arr: 20_000,
    renewalInDays: 170, seats: 30, active: 21, usage: [20, 20, 21, 21],
    championLastContactDays: 25, openTickets: 10, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Spike in how-to tickets around the new UI.' }],
  }, // yellow (support volume only)
  {
    id: 'blueyonder', name: 'Blue Yonder Airlines', segment: 'enterprise', arr: 260_000, priorArr: 300_000,
    renewalInDays: 75, seats: 110, active: 70, usage: [90, 85, 82, 70],
    championLastContactDays: 50, openTickets: 6, ownerCsm: 'Devin Park', lastTouchDays: 52,
    interactionSummaries: [{ text: 'Champion travel-heavy; hard to reach lately.' }],
  }, // yellow (champion silence; 17.6% usage dip below the 20% bar)
  {
    id: 'fabrikamresidences', name: 'Fabrikam Residences', segment: 'smb', arr: 16_000,
    renewalInDays: 120, seats: 15, active: 4, usage: [5, 4, 4, 4],
    championLastContactDays: 30, openTickets: 1, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Rollout stalled at a single team.' }],
  }, // yellow (adoption gap only)

  // ---- NEW hard-signal yellows ----
  {
    id: 'cadencedrop', name: 'Sterling Freight', segment: 'mid_market', arr: 88_000,
    renewalInDays: 160, seats: 60, active: 45, usage: [44, 45, 45, 45],
    championLastContactDays: 20, openTickets: 2, ownerCsm: 'Maya Chen',
    cadence: { priorTouchpoints: 4, recentTouchpoints: 1 },
    interactionSummaries: [{ text: 'Used to meet biweekly; scheduling has slipped.', kind: 'email' }],
  }, // yellow (engagement_cadence only)
  {
    id: 'slowreplies', name: 'Tavern Supply Co', segment: 'mid_market', arr: 64_000,
    renewalInDays: 165, seats: 50, active: 35, usage: [34, 35, 35, 35],
    championLastContactDays: 28, openTickets: 2, ownerCsm: 'Devin Park',
    responsiveness: [
      { asOf: daysAgo(50), medianReplyHours: 20, replyRatePct: 85 },
      { asOf: daysAgo(8), medianReplyHours: 120, replyRatePct: 25 },
    ],
    interactionSummaries: [{ text: 'Emails increasingly going unanswered.', kind: 'email' }],
  }, // yellow (email_responsiveness only)
  {
    id: 'stickydrop', name: 'Ridgeline Retail', segment: 'mid_market', arr: 70_000,
    renewalInDays: 155, seats: 60, active: 50, usage: [50, 50, 50, 50], logins: [400, 400, 260, 150],
    championLastContactDays: 21, openTickets: 2, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Same license count, but people are logging in far less often.', kind: 'meeting' }],
  }, // yellow (stickiness_decline only)
  {
    id: 'onboardstall', name: 'Newframe Studios', segment: 'smb', arr: 21_000,
    renewalInDays: 300, seats: 25, active: 4, usage: [], activatedDaysAgo: null, createdDaysAgo: 60,
    championLastContactDays: 35, openTickets: 1, ownerCsm: 'Rosa Alvarez', lifecycleState: 'new',
    interactionSummaries: [{ text: 'Kickoff done 8 weeks ago but the team never went live.' }],
  }, // yellow (onboarding_stalled only)

  // ---- NEW red: billing critical ----
  {
    id: 'billinghold', name: 'Cascade Logistics', segment: 'mid_market', arr: 130_000,
    renewalInDays: 110, seats: 80, active: 62, usage: [61, 62, 62, 62],
    championLastContactDays: 24, openTickets: 3, ownerCsm: 'Rosa Alvarez', lifecycleState: 'at_risk',
    billing: { overdueInvoice: true, disputedInvoice: true },
    interactionSummaries: [{ text: 'Finance is disputing the last invoice and payment is overdue.' }],
  }, // red (billing_friction critical)

  // ---- NEW: soft + hard stack (hard-only = yellow; with soft competitor = red) ----
  {
    id: 'featuredrop', name: 'Data Insights Co', segment: 'mid_market', arr: 98_000,
    renewalInDays: 150, seats: 70, active: 55, usage: [54, 55, 55, 55],
    championLastContactDays: 26, openTickets: 2, ownerCsm: 'Maya Chen',
    features: [
      { label: 'Advanced Analytics', isKeyFeature: true, prior: 42, recent: 0 },
      { label: 'Dashboards', isKeyFeature: false, prior: 30, recent: 28 },
    ],
    interactionSummaries: [{ text: 'They mentioned they are evaluating a competitor, Rival Analytics, for reporting.', kind: 'call' }],
  }, // hard-only: yellow (feature_depth). With soft competitor_mention → red (pipeline test).

  // ---- Stacked reds (hard) ----
  {
    id: 'contosopharma', name: 'Contoso Pharma', segment: 'enterprise', arr: 250_000,
    renewalInDays: 200, seats: 100, active: 62, usage: [95, 90, 80, 62], lifecycleState: 'at_risk',
    championLastContactDays: 15, openTickets: 3, ownerCsm: 'Maya Chen',
    interactionSummaries: [{ text: 'Sharp usage drop after a key team switched tools.' }, { text: 'The exec sponsor has stopped joining our calls and was dismissive on the last one.', kind: 'call' }],
  }, // red (usage decline critical)
  {
    id: 'graphicdesign', name: 'Graphic Design Institute', segment: 'mid_market', arr: 84_000, priorArr: 100_000,
    renewalInDays: 140, seats: 60, active: 24, usage: [26, 25, 24, 24], lifecycleState: 'at_risk',
    championLastContactDays: 70, openTickets: 3, ownerCsm: 'Maya Chen', lastTouchDays: 70,
    interactionSummaries: [{ text: 'Low adoption and champion has gone dark.' }],
  }, // red (adoption + champion silence = 2 warnings)
  {
    id: 'vanarsdel', name: 'VanArsdel Ltd', segment: 'enterprise', arr: 200_000,
    renewalInDays: 30, seats: 100, active: 40, usage: [41, 40, 40, 40], lifecycleState: 'at_risk',
    championLastContactDays: 20, openTickets: 4, ownerCsm: 'Maya Chen',
    interactionSummaries: [{ text: 'Renewal a month out with weak adoption — needs a save plan.' }],
  }, // red (imminent renewal amplifies adoption gap → critical)
  {
    id: 'alpineski', name: 'Alpine Ski House', segment: 'mid_market', arr: 110_000,
    renewalInDays: 180, seats: 70, active: 50, usage: [49, 49, 50, 50], lifecycleState: 'at_risk',
    championLastContactDays: 18, openTickets: 5, criticalTickets: 2, ownerCsm: 'Rosa Alvarez',
    interactionSummaries: [{ text: 'Customer is furious about two sev-1 outages and threatening to escalate to their exec.', kind: 'support' }],
    ticketDetail: [
      { subject: 'Repeated outages during business hours', severity: 'p1', slaStatus: 'breached', tone: 'frustrated', ageDays: 6 },
      { subject: 'Data export failing for finance team', severity: 'p1', slaStatus: 'breached', tone: 'frustrated', ageDays: 4 },
      { subject: 'SSO users intermittently logged out', severity: 'p2', slaStatus: 'at_risk', tone: 'negative', ageDays: 9 },
      { subject: 'Report scheduling not working', severity: 'p2', slaStatus: 'at_risk', tone: 'negative', ageDays: 12 },
      { subject: 'Permission mapping question', severity: 'p3', slaStatus: 'ok', tone: 'neutral', ageDays: 3 },
    ],
  }, // red (critical support tickets)
  {
    id: 'bestforyou', name: 'Best For You Organics', segment: 'enterprise', arr: 220_000,
    renewalInDays: 90, seats: 120, active: 55, usage: [92, 85, 70, 55], lifecycleState: 'at_risk',
    championLastContactDays: 80, openTickets: 4, ownerCsm: 'Maya Chen', lastTouchDays: 80,
    interactionSummaries: [{ text: 'Everything trending the wrong way; champion unreachable for weeks and frustrated with results.' }],
  }, // red (usage decline + adoption + champion silence)

  // ---- Renewal-amplified: now YELLOW under jeopardy tiers (far, low-ARR, single driver) ----
  {
    id: 'relecloud', name: 'Relecloud', segment: 'mid_market', arr: 90_000, priorArr: 110_000,
    renewalInDays: 45, seats: 50, active: 32, usage: [31, 31, 32, 32],
    championLastContactDays: 65, openTickets: 2, ownerCsm: 'Devin Park', lastTouchDays: 66,
    interactionSummaries: [{ text: 'Renewal near and the champion has gone silent.' }],
  }, // yellow (champion silence + low-jeopardy renewal warning; was red pre-Phase-3)
  {
    id: 'margiestravel', name: "Margie's Travel", segment: 'smb', arr: 28_000,
    renewalInDays: 40, seats: 30, active: 10, usage: [11, 10, 10, 10],
    championLastContactDays: 20, openTickets: 2, ownerCsm: 'Tom Becker',
    interactionSummaries: [{ text: 'Small deployment, renewal looming, adoption thin.' }],
  }, // yellow (adoption gap + low-jeopardy renewal warning; was red pre-Phase-3)

  // ---- Cold-start: thin data must never read red ----
  {
    id: 'treyresearch', name: 'Trey Research', segment: 'smb', arr: 18_000,
    renewalInDays: 350, seats: 40, active: 6, usage: [6], activatedDaysAgo: null,
    championLastContactDays: null, createdDaysAgo: 15, openTickets: 0, ownerCsm: 'Tom Becker', lifecycleState: 'new',
    interactionSummaries: [],
  }, // green (cold-start)
  {
    id: 'lucerne', name: 'Lucerne Publishing', segment: 'mid_market', arr: 54_000,
    renewalInDays: 340, seats: 60, active: 12, usage: [], activatedDaysAgo: null,
    championLastContactDays: 18, createdDaysAgo: 20, openTickets: 1, ownerCsm: 'Rosa Alvarez', lifecycleState: 'new',
    interactionSummaries: [{ text: 'Kickoff call held; rollout just beginning.' }],
  }, // green (cold-start)
];

export const MOCK_ACCOUNTS: Account[] = SPECS.map(build);
