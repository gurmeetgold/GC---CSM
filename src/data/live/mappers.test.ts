import { describe, it, expect } from 'vitest';
import { UnifiedApiDataSource } from './UnifiedApiDataSource';
import { mapSegment, mapArr, mapRenewalDate, mapContact, assembleAccount } from './mappers';
import {
  makeMergeClient,
  makeGongClient,
  FIXTURE_ACCOUNTS,
  FIXTURE_OPPORTUNITIES,
} from './__fixtures__/vendorFixtures';
import type { Account } from '../../domain';

const NOW = new Date('2026-08-13T12:00:00.000Z');

async function loadUnified(): Promise<(id: string) => Account> {
  const src = new UnifiedApiDataSource(makeMergeClient(), makeGongClient());
  const accounts = await src.listAccounts();
  const map = new Map(accounts.map((a) => [a.id, a] as const));
  return (id: string) => {
    const a = map.get(id);
    if (!a) throw new Error(`no account ${id}`);
    return a;
  };
}

describe('vendor → domain mapping', () => {
  it('maps a clean, well-configured account correctly', async () => {
    const a = (await loadUnified())('acct-clean');
    expect(a.name).toBe('Clean Corp');
    expect(a.segment).toBe('enterprise'); // 1200 employees
    expect(a.arr).toBe(240_000); // explicit custom field
    expect(a.renewalDate).toBe('2026-10-01');
    expect(a.licensedSeats).toBe(100);
    expect(a.activeUsers).toBe(90);
    expect(a.usageHistory).toHaveLength(3);
    expect(a.contacts[0]?.isChampion).toBe(true);
    expect(a.interactions).toHaveLength(1); // one matched Gong call
    expect(a.openTickets).toBe(2); // two non-closed
    expect(a.criticalTickets).toBe(1); // one URGENT
  });

  it('handles alternate field casing and string-typed numbers', async () => {
    const a = (await loadUnified())('acct-nogong');
    expect(a.arr).toBe(120_000); // from "ARR": "120000"
    expect(a.licensedSeats).toBe(60); // Licensed_Seats__c
    expect(a.activeUsers).toBe(20);
    expect(a.segment).toBe('mid_market');
    expect(a.interactions).toHaveLength(0); // no Gong data — must not crash
    expect(a.contacts[0]?.isChampion).toBe(false); // "Analyst", no champion flag
  });

  it('handles a messy account: missing name, no ARR field, inferred champion', async () => {
    const a = (await loadUnified())('acct-messy');
    expect(a.name).toBe('Unnamed account'); // null name defaulted
    expect(a.segment).toBe('smb'); // 40 employees
    expect(a.arr).toBe(45_000); // fell back to WON opportunity amount
    expect(a.renewalDate).toBe('2026-09-20'); // soonest future OPEN opp close date
    expect(a.licensedSeats).toBe(30); // "seats": "30"
    expect(a.activeUsers).toBe(0); // absent → 0
    expect(a.contacts[0]?.isChampion).toBe(true); // "Director of IT" inferred
  });

  it('handles a sparse cold-start account with no custom fields', async () => {
    const a = (await loadUnified())('acct-sparse');
    expect(a.arr).toBe(0);
    expect(a.licensedSeats).toBe(0);
    expect(a.activeUsers).toBe(0);
    expect(a.usageHistory).toEqual([]);
    expect(a.renewalDate).toBe(''); // unknown → empty (engine tolerates)
    expect(a.contacts).toEqual([]);
  });

  it('ignores Gong calls whose crm_account_id matches no account', async () => {
    const src = new UnifiedApiDataSource(makeMergeClient(), makeGongClient());
    const accounts = await src.listAccounts();
    const totalInteractions = accounts.reduce((n, a) => n + a.interactions.length, 0);
    expect(totalInteractions).toBe(1); // only the matched call; the unmatched one is dropped
  });

  // --- unit-level mapper checks ---
  it('mapSegment falls back to employee count when no custom field', () => {
    expect(mapSegment(FIXTURE_ACCOUNTS[0]!)).toBe('enterprise');
    expect(mapSegment(FIXTURE_ACCOUNTS[3]!)).toBe('smb'); // null employees → smb floor
  });

  it('mapArr does not fall back to company annual_revenue', () => {
    const acct = { ...FIXTURE_ACCOUNTS[0]!, custom_fields: null, annual_revenue: 99_000_000 };
    expect(mapArr(acct, [])).toBe(0); // no ARR field, no won opps → 0, NOT annual_revenue
  });

  it('mapRenewalDate prefers custom field, then future open opp', () => {
    const acct = { ...FIXTURE_ACCOUNTS[2]! };
    expect(mapRenewalDate(acct, FIXTURE_OPPORTUNITIES, NOW)).toBe('2026-09-20');
  });

  it('mapContact infers champion from title hints', () => {
    const champ = mapContact({
      id: 'x', remote_id: null, first_name: 'A', last_name: 'B', title: 'Head of Revenue',
      account: 'acct', last_activity_at: null, custom_fields: null,
    });
    expect(champ.isChampion).toBe(true);
  });

  it('assembleAccount never throws on a fully-empty bundle', () => {
    const empty = {
      account: { id: 'z', remote_id: null, name: null, industry: null, annual_revenue: null, number_of_employees: null, created_at: null, remote_created_at: null, custom_fields: null },
      contacts: [], opportunities: [], tickets: [], calls: [],
    };
    expect(() => assembleAccount(empty, NOW)).not.toThrow();
  });
});
