import { describe, it, expect } from 'vitest';
import { mapMergeTicket, deriveSlaStatus, severityFromPriority, mapTicketsForAccount } from './ticketMappers';
import type { MergeTicket } from './vendorTypes';

const NOW = new Date('2026-08-13T12:00:00.000Z');

function ticket(over: Partial<MergeTicket>): MergeTicket {
  return {
    id: 't', name: 'Subject', status: 'OPEN', priority: 'NORMAL', account: 'a',
    created_at: '2026-08-10T00:00:00Z', modified_at: '2026-08-11T00:00:00Z', due_date: null, ...over,
  };
}

describe('severityFromPriority', () => {
  it('maps Merge priority to domain severity', () => {
    expect(severityFromPriority('URGENT')).toBe('p1');
    expect(severityFromPriority('HIGH')).toBe('p2');
    expect(severityFromPriority('NORMAL')).toBe('p3');
    expect(severityFromPriority('LOW')).toBe('p3');
    expect(severityFromPriority(null)).toBe('p3');
  });
});

describe('deriveSlaStatus', () => {
  it('is ok when the ticket is resolved regardless of due date', () => {
    expect(deriveSlaStatus(ticket({ status: 'CLOSED', due_date: '2020-01-01T00:00:00Z' }), NOW)).toBe('ok');
  });
  it('is ok when there is no due date', () => {
    expect(deriveSlaStatus(ticket({ due_date: null }), NOW)).toBe('ok');
  });
  it('is breached when open and past due', () => {
    expect(deriveSlaStatus(ticket({ due_date: '2026-08-12T00:00:00Z' }), NOW)).toBe('breached');
  });
  it('is at_risk when open and due within 24h', () => {
    expect(deriveSlaStatus(ticket({ due_date: '2026-08-14T06:00:00Z' }), NOW)).toBe('at_risk');
  });
  it('is ok when open and due comfortably in the future', () => {
    expect(deriveSlaStatus(ticket({ due_date: '2026-09-01T00:00:00Z' }), NOW)).toBe('ok');
  });
});

describe('mapMergeTicket', () => {
  it('maps a full ticket to the domain shape with derived SLA and neutral tone', () => {
    const t = mapMergeTicket(ticket({ name: 'Outage', priority: 'URGENT', due_date: '2026-08-12T00:00:00Z' }), NOW);
    expect(t).toMatchObject({ subject: 'Outage', severity: 'p1', resolved: false, slaStatus: 'breached', tone: 'neutral' });
  });
  it('defaults a missing subject', () => {
    expect(mapMergeTicket(ticket({ name: null }), NOW).subject).toBe('Support ticket');
  });
});

describe('mapTicketsForAccount', () => {
  it('derives open + critical counts from the mapped tickets (engine inputs)', () => {
    const res = mapTicketsForAccount([
      ticket({ id: '1', priority: 'URGENT', status: 'OPEN' }),
      ticket({ id: '2', priority: 'NORMAL', status: 'OPEN' }),
      ticket({ id: '3', priority: 'HIGH', status: 'CLOSED' }),
    ], NOW);
    expect(res.tickets).toHaveLength(3);
    expect(res.openTickets).toBe(2);   // 1 and 2
    expect(res.criticalTickets).toBe(1); // only the open URGENT
  });
});
