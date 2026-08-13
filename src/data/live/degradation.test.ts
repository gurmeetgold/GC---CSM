import { describe, it, expect } from 'vitest';
import { UnifiedApiDataSource } from './UnifiedApiDataSource';
import { makeMergeClient, makeGongClient, failing } from './__fixtures__/vendorFixtures';
import { SourceUnavailableError } from './clients';

/**
 * Graceful degradation: one flaky source must not crash the account. Each side-fetch
 * degrades to empty independently; only the CRM account backbone being down is fatal.
 */
describe('graceful degradation', () => {
  it('Gong down, Salesforce up → accounts still render, just without call interactions', async () => {
    const src = new UnifiedApiDataSource(
      makeMergeClient(),
      makeGongClient({ listCalls: failing('gong') }),
    );
    const accounts = await src.listAccounts();
    expect(accounts.length).toBe(4);
    expect(accounts.every((a) => a.interactions.length === 0)).toBe(true);
    // Hard-signal-relevant fields still present.
    const clean = accounts.find((a) => a.id === 'acct-clean')!;
    expect(clean.activeUsers).toBe(90);
    expect(clean.licensedSeats).toBe(100);
  });

  it('no Gong client at all → still fine (SFDC-only deployment)', async () => {
    const src = new UnifiedApiDataSource(makeMergeClient(), null);
    const accounts = await src.listAccounts();
    expect(accounts.length).toBe(4);
    expect(accounts.every((a) => a.interactions.length === 0)).toBe(true);
  });

  it('Ticketing down → accounts render with zero tickets, no crash', async () => {
    const src = new UnifiedApiDataSource(
      makeMergeClient({ listTickets: failing('merge', 'ticketing not connected') }),
      makeGongClient(),
    );
    const accounts = await src.listAccounts();
    const clean = accounts.find((a) => a.id === 'acct-clean')!;
    expect(clean.openTickets).toBe(0);
    expect(clean.criticalTickets).toBe(0);
  });

  it('Contacts & opportunities down → accounts still render with available data', async () => {
    const src = new UnifiedApiDataSource(
      makeMergeClient({
        listContacts: failing('merge'),
        listOpportunities: failing('merge'),
      }),
      makeGongClient(),
    );
    const accounts = await src.listAccounts();
    expect(accounts.length).toBe(4);
    const clean = accounts.find((a) => a.id === 'acct-clean')!;
    expect(clean.contacts).toEqual([]);
    expect(clean.activeUsers).toBe(90); // account-level custom fields survive
  });

  it('CRM account backbone down → surfaces as an error (nothing to render)', async () => {
    const src = new UnifiedApiDataSource(
      makeMergeClient({ listAccounts: failing('merge', 'CRM outage') }),
      makeGongClient(),
    );
    await expect(src.listAccounts()).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});
