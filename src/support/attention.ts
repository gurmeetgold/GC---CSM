import type { EvaluatedAccount } from '../answer';
import type { RiskLevel, SlaStatus, SupportTicket } from '../domain';

/**
 * Support & Technical Attention — pure derivations from HELP-DESK + Slack data only
 * (no engineering/incident tooling). Ties ticket strain to account risk so a CSM
 * sees which tickets are pulling an account toward red.
 */

export interface TicketRow {
  ticketId: string;
  accountId: string;
  accountName: string;
  ownerCsm: string;
  arr: number;
  riskLevel: RiskLevel;
  subject: string;
  severity: SupportTicket['severity'];
  slaStatus: SlaStatus;
  tone: SupportTicket['tone'];
  ageDays: number;
}

function ageDays(openedAt: string, now: Date): number {
  const ms = Date.parse(openedAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000));
}

/** Flatten all open tickets across the book into rows joined with account context. */
export function openTicketRows(book: EvaluatedAccount[], now: Date): TicketRow[] {
  const rows: TicketRow[] = [];
  for (const e of book) {
    for (const t of e.account.tickets ?? []) {
      if (t.resolved) continue;
      rows.push({
        ticketId: t.id,
        accountId: e.account.id,
        accountName: e.account.name,
        ownerCsm: e.account.ownerCsm,
        arr: e.account.arr,
        riskLevel: e.evaluation.riskLevel,
        subject: t.subject,
        severity: t.severity,
        slaStatus: t.slaStatus,
        tone: t.tone,
        ageDays: ageDays(t.openedAt, now),
      });
    }
  }
  return rows;
}

const SEV_WEIGHT: Record<SupportTicket['severity'], number> = { p1: 3, p2: 2, p3: 1 };
const SLA_WEIGHT: Record<SlaStatus, number> = { breached: 3, at_risk: 2, ok: 0 };

/** Tickets needing attention, ranked by severity + SLA posture + age. */
export function ticketsNeedingAttention(book: EvaluatedAccount[], now: Date): TicketRow[] {
  return openTicketRows(book, now)
    .map((r) => ({ r, score: SEV_WEIGHT[r.severity] * 3 + SLA_WEIGHT[r.slaStatus] * 2 + Math.min(r.ageDays, 14) / 5 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Tickets breaching or approaching SLA. */
export function slaBreaches(book: EvaluatedAccount[], now: Date): TicketRow[] {
  return openTicketRows(book, now)
    .filter((r) => r.slaStatus !== 'ok')
    .sort((a, b) => SLA_WEIGHT[b.slaStatus] - SLA_WEIGHT[a.slaStatus] || b.ageDays - a.ageDays);
}

/** Aging tickets (open longer than `minAgeDays`). */
export function agingTickets(book: EvaluatedAccount[], now: Date, minAgeDays = 7): TicketRow[] {
  return openTicketRows(book, now)
    .filter((r) => r.ageDays >= minAgeDays)
    .sort((a, b) => b.ageDays - a.ageDays);
}

export interface AccountSupportStrain {
  accountId: string;
  accountName: string;
  ownerCsm: string;
  arr: number;
  riskLevel: RiskLevel;
  openTickets: number;
  p1Tickets: number;
  breaches: number;
  /** True when a support signal actually fired for this account (ticket strain → risk). */
  supportSignalFired: boolean;
  signalHeadlines: string[];
}

/**
 * Accounts whose support load is pulling them toward red — where a hard `support_strain`
 * or soft `support_sentiment` signal fired. This is the honest "ticket → account risk" link.
 */
export function accountsPulledByTickets(book: EvaluatedAccount[]): AccountSupportStrain[] {
  return book
    .map((e) => {
      const open = (e.account.tickets ?? []).filter((t) => !t.resolved);
      const supportSignals = e.evaluation.signals.filter(
        (s) => s.type === 'support_strain' || s.type === 'support_sentiment',
      );
      return {
        accountId: e.account.id,
        accountName: e.account.name,
        ownerCsm: e.account.ownerCsm,
        arr: e.account.arr,
        riskLevel: e.evaluation.riskLevel,
        openTickets: open.length,
        p1Tickets: open.filter((t) => t.severity === 'p1').length,
        breaches: open.filter((t) => t.slaStatus === 'breached').length,
        supportSignalFired: supportSignals.length > 0,
        signalHeadlines: supportSignals.map((s) => s.headline),
      };
    })
    .filter((r) => r.supportSignalFired || r.breaches > 0 || r.p1Tickets > 0)
    .sort((a, b) => Number(b.supportSignalFired) - Number(a.supportSignalFired) || b.arr - a.arr);
}

export interface SupportSummary {
  openTotal: number;
  p1Total: number;
  breachedTotal: number;
  atRiskSlaTotal: number;
  accountsAffected: number;
}

export function supportSummary(book: EvaluatedAccount[], now: Date): SupportSummary {
  const rows = openTicketRows(book, now);
  const accounts = new Set(rows.map((r) => r.accountId));
  return {
    openTotal: rows.length,
    p1Total: rows.filter((r) => r.severity === 'p1').length,
    breachedTotal: rows.filter((r) => r.slaStatus === 'breached').length,
    atRiskSlaTotal: rows.filter((r) => r.slaStatus === 'at_risk').length,
    accountsAffected: accounts.size,
  };
}
