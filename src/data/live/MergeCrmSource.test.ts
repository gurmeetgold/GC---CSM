import { describe, it, expect } from 'vitest';
import { MergeCrmSource } from './MergeCrmSource';
import { makeMergeClient, failing } from './__fixtures__/vendorFixtures';

describe('MergeCrmSource', () => {
  it('maps unified CRM accounts into normalized domain accounts', async () => {
    const src = new MergeCrmSource(makeMergeClient());
    const accounts = await src.listAccounts();

    const clean = accounts.find((a) => a.id === 'acct-clean')!;
    expect(clean.name).toBe('Clean Corp');
    expect(clean.segment).toBe('enterprise');
    expect(clean.arr).toBe(240_000);
    expect(clean.licensedSeats).toBe(100);
    expect(clean.activeUsers).toBe(90);
    // CRM-only adapter never carries tickets or interactions.
    expect(clean.tickets).toEqual([]);
    expect(clean.openTickets).toBe(0);
    expect(clean.interactions).toEqual([]);
  });

  it('falls back to WON opportunities for ARR when no arr custom field exists', async () => {
    const src = new MergeCrmSource(makeMergeClient());
    const messy = (await src.listAccounts()).find((a) => a.id === 'acct-messy')!;
    expect(messy.arr).toBe(45_000); // from the WON opportunity
    expect(messy.name).toBe('Unnamed account');
  });

  it('surfaces a backbone (account list) failure rather than hiding it', async () => {
    const src = new MergeCrmSource(makeMergeClient({ listAccounts: failing('merge') }));
    await expect(src.listAccounts()).rejects.toThrow();
  });

  it('degrades contacts/opportunities to empty independently without crashing', async () => {
    const src = new MergeCrmSource(
      makeMergeClient({ listContacts: failing('merge'), listOpportunities: failing('merge') }),
    );
    const accounts = await src.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.every((a) => a.contacts.length === 0)).toBe(true);
  });

  it('reports connection status: not_connected before sync, connected after', async () => {
    const src = new MergeCrmSource(makeMergeClient());
    expect(src.connections()[0]!.status).toBe('not_connected');
    await src.listAccounts();
    expect(src.connections()[0]).toMatchObject({ name: 'Merge CRM', status: 'connected' });
  });

  it('reports cold_start when connected but the book is empty', async () => {
    const src = new MergeCrmSource(makeMergeClient({ listAccounts: async () => [] }));
    await src.listAccounts();
    expect(src.connections()[0]!.status).toBe('cold_start');
  });
});
