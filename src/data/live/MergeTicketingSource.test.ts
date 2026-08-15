import { describe, it, expect } from 'vitest';
import { MergeTicketingSource } from './MergeTicketingSource';
import { makeMergeClient, FIXTURE_TICKETS, failing } from './__fixtures__/vendorFixtures';
import type { MergeTicket } from './vendorTypes';

const NOW = new Date('2026-08-13T12:00:00.000Z');

describe('MergeTicketingSource', () => {
  it('maps vendor tickets into domain support tickets grouped by account', async () => {
    const src = new MergeTicketingSource(makeMergeClient());
    const byAccount = await src.load(NOW);

    const clean = byAccount.get('acct-clean');
    expect(clean).toBeDefined();
    expect(clean!.tickets).toHaveLength(3);
    // Engine inputs derived from the mapped tickets: 2 open, 1 open+urgent.
    expect(clean!.openTickets).toBe(2);
    expect(clean!.criticalTickets).toBe(1);

    // SLA is derived, not copied from a vendor field.
    const breached = clean!.tickets.find((t) => t.id === 't1')!;
    expect(breached.slaStatus).toBe('breached');
    expect(breached.severity).toBe('p1');
    expect(breached.resolved).toBe(false);
    // Help desks don't emit sentiment — tone is always neutral.
    expect(clean!.tickets.every((t) => t.tone === 'neutral')).toBe(true);
  });

  it('ignores tickets with no account id', async () => {
    const src = new MergeTicketingSource(
      makeMergeClient({ listTickets: async (): Promise<MergeTicket[]> => [{ ...FIXTURE_TICKETS[0]!, account: null }] }),
    );
    const byAccount = await src.load(NOW);
    expect(byAccount.size).toBe(0);
  });

  it('degrades to an empty map when ticketing is unavailable', async () => {
    const src = new MergeTicketingSource(makeMergeClient({ listTickets: failing('merge') }));
    const byAccount = await src.load(NOW);
    expect(byAccount.size).toBe(0);
    expect(src.connections()[0]).toMatchObject({ name: 'Merge Ticketing', status: 'not_connected' });
  });

  it('reports connection status: not_connected before sync, connected after tickets arrive', async () => {
    const src = new MergeTicketingSource(makeMergeClient());
    expect(src.connections()[0]!.status).toBe('not_connected');
    await src.load(NOW);
    expect(src.connections()[0]).toMatchObject({ name: 'Merge Ticketing', status: 'connected' });
  });

  it('reports cold_start when connected but no tickets exist yet', async () => {
    const src = new MergeTicketingSource(makeMergeClient({ listTickets: async () => [] }));
    await src.load(NOW);
    expect(src.connections()[0]!.status).toBe('cold_start');
  });
});
