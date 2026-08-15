import type { SlaStatus, SupportTicket, TicketSeverity } from '../../domain';
import type { MergeTicket, MergeTicketPriority, MergeTicketStatus } from './vendorTypes';

/**
 * Merge Ticketing → domain `SupportTicket`. Pure; vendor field names stop here.
 *
 * Two honesty notes (also in DATA_HANDLING.md):
 *  - SLA posture is DERIVED (from due_date vs. now + open/closed), not provided
 *    verbatim by most help desks.
 *  - Ticket TONE is not emitted by help desks, so it is always `neutral` from this
 *    source; language sentiment would need a later NLP/Gong pass.
 */

const AT_RISK_WINDOW_MS = 24 * 60 * 60 * 1000; // due within 24h → at risk

export function severityFromPriority(priority: MergeTicketPriority): TicketSeverity {
  switch (priority) {
    case 'URGENT':
      return 'p1';
    case 'HIGH':
      return 'p2';
    default:
      return 'p3'; // NORMAL / LOW / null
  }
}

export function isResolved(status: MergeTicketStatus): boolean {
  return status === 'CLOSED';
}

/** Derive SLA posture from the due date and open/closed state. */
export function deriveSlaStatus(ticket: MergeTicket, now: Date): SlaStatus {
  if (isResolved(ticket.status)) return 'ok';
  if (!ticket.due_date) return 'ok'; // no SLA target → nothing to breach
  const due = Date.parse(ticket.due_date);
  if (Number.isNaN(due)) return 'ok';
  if (due < now.getTime()) return 'breached';
  if (due - now.getTime() <= AT_RISK_WINDOW_MS) return 'at_risk';
  return 'ok';
}

export function mapMergeTicket(ticket: MergeTicket, now: Date): SupportTicket {
  return {
    id: ticket.id,
    subject: ticket.name?.trim() || 'Support ticket',
    severity: severityFromPriority(ticket.priority),
    openedAt: ticket.created_at ?? '',
    resolved: isResolved(ticket.status),
    slaStatus: deriveSlaStatus(ticket, now),
    tone: 'neutral', // help desks don't emit sentiment (see DATA_HANDLING.md)
  };
}

/** Map a batch and derive the engine's ticket-count inputs from the mapped result. */
export function mapTicketsForAccount(tickets: MergeTicket[], now: Date): {
  tickets: SupportTicket[];
  openTickets: number;
  criticalTickets: number;
} {
  const mapped = tickets.map((t) => mapMergeTicket(t, now));
  const open = mapped.filter((t) => !t.resolved);
  return {
    tickets: mapped,
    openTickets: open.length,
    criticalTickets: open.filter((t) => t.severity === 'p1').length,
  };
}
