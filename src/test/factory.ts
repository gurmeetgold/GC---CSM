import type { Account, Contact, UsageSnapshot } from '../domain';

/**
 * A test account factory. Produces a HEALTHY baseline account (no signals fire)
 * so each test can perturb exactly one dimension and assert the effect in
 * isolation. Dates are relative to the fixed NOW below.
 */
export const NOW = new Date('2026-08-13T12:00:00.000Z');
const DAY = 86_400_000;

export function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}
export function daysAhead(n: number): string {
  return new Date(NOW.getTime() + n * DAY).toISOString();
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
  const champion: Contact = {
    id: 'c1',
    name: 'Test Champion',
    title: 'VP',
    isChampion: true,
    lastContactedAt: daysAgo(10),
  };
  const usageHistory: UsageSnapshot[] = [
    { asOf: daysAgo(120), activeUsers: 70 },
    { asOf: daysAgo(90), activeUsers: 72 },
    { asOf: daysAgo(60), activeUsers: 74 },
    { asOf: daysAgo(30), activeUsers: 75 },
  ];
  const base: Account = {
    id: 'test-acct',
    name: 'Test Account',
    segment: 'mid_market',
    arr: 100_000,
    renewalDate: daysAhead(240), // far out
    licensedSeats: 100,
    activeUsers: 75, // 75% adoption — healthy
    usageHistory,
    contacts: [champion],
    interactions: [],
    openTickets: 2,
    criticalTickets: 0,
    createdAt: daysAgo(500), // established, not cold-start
    // Phase 3 fields — healthy/neutral defaults so no new signal fires by default.
    responsiveness: [],
    featureUsage: [],
    activatedAt: daysAgo(480),
    billingFlags: { overdueInvoice: false, disputedInvoice: false, pricingPushback: false },
    ownerCsm: 'Test CSM',
    priorArr: 100_000,
    lifecycleState: 'active',
  };
  return { ...base, ...overrides };
}
