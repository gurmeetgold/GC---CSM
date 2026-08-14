import { describe, it, expect } from 'vitest';
import { MockDataSource } from './mock/MockDataSource';
import { UnifiedApiDataSource } from './live/UnifiedApiDataSource';
import { makeMergeClient, makeGongClient } from './live/__fixtures__/vendorFixtures';
import type { Account } from '../domain';

/**
 * ANTI-DRIFT CONTRACT TEST.
 *
 * The whole architecture rests on both data sources emitting the IDENTICAL
 * normalized shape. This asserts it structurally: every account from either source
 * must satisfy the same schema (same keys, same value types), and the two sources
 * must expose the same top-level key set. If a future change to one source drifts
 * the shape, this fails loudly.
 */

type Checker = (v: unknown) => boolean;
const isString: Checker = (v) => typeof v === 'string';
const isNumber: Checker = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool: Checker = (v) => typeof v === 'boolean';
const isStringOrNull: Checker = (v) => v === null || typeof v === 'string';

const ACCOUNT_SCHEMA: Record<keyof Account, Checker> = {
  id: isString,
  name: isString,
  segment: (v) => v === 'smb' || v === 'mid_market' || v === 'enterprise',
  arr: isNumber,
  renewalDate: isString,
  licensedSeats: isNumber,
  activeUsers: isNumber,
  usageHistory: (v) => Array.isArray(v),
  contacts: (v) => Array.isArray(v),
  interactions: (v) => Array.isArray(v),
  openTickets: isNumber,
  criticalTickets: isNumber,
  createdAt: isString,
  // Phase 3 fields — both sources must emit these identically.
  responsiveness: (v) => Array.isArray(v),
  featureUsage: (v) => Array.isArray(v),
  activatedAt: isStringOrNull,
  billingFlags: (v) =>
    !!v && typeof v === 'object' &&
    typeof (v as Record<string, unknown>).overdueInvoice === 'boolean' &&
    typeof (v as Record<string, unknown>).disputedInvoice === 'boolean' &&
    typeof (v as Record<string, unknown>).pricingPushback === 'boolean',
  ownerCsm: isString,
  priorArr: isNumber,
  lifecycleState: (v) =>
    v === 'new' || v === 'active' || v === 'expanding' || v === 'at_risk' || v === 'churned',
  // Phase 4 fields — both sources must emit these identically.
  tickets: (v) => Array.isArray(v),
  opportunities: (v) => Array.isArray(v),
  trendSeries: (v) => Array.isArray(v),
};

function assertAccountShape(a: Account, label: string): void {
  const keys = Object.keys(a).sort();
  expect(keys, `${label}: top-level keys`).toEqual(Object.keys(ACCOUNT_SCHEMA).sort());

  for (const [key, check] of Object.entries(ACCOUNT_SCHEMA)) {
    expect(check((a as unknown as Record<string, unknown>)[key]), `${label}: field "${key}" type`).toBe(true);
  }
  for (const c of a.contacts) {
    expect(isString(c.id) && isString(c.name) && isString(c.title) && isBool(c.isChampion) && isStringOrNull(c.lastContactedAt), `${label}: contact shape`).toBe(true);
  }
  for (const i of a.interactions) {
    expect(isString(i.id) && isString(i.occurredAt) && isString(i.kind) && isString(i.summary), `${label}: interaction shape`).toBe(true);
  }
  for (const u of a.usageHistory) {
    expect(isString(u.asOf) && isNumber(u.activeUsers), `${label}: usage snapshot shape`).toBe(true);
  }
}

describe('DataSource contract (anti-drift)', () => {
  const mock = new MockDataSource();
  const unified = new UnifiedApiDataSource(makeMergeClient(), makeGongClient());

  it('every MockDataSource account satisfies the normalized schema', async () => {
    const accounts = await mock.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    accounts.forEach((a) => assertAccountShape(a, `mock/${a.id}`));
  });

  it('every UnifiedApiDataSource account satisfies the normalized schema', async () => {
    const accounts = await unified.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    accounts.forEach((a) => assertAccountShape(a, `unified/${a.id}`));
  });

  it('both sources expose the identical top-level Account key set', async () => {
    const [m] = await mock.listAccounts();
    const [u] = await unified.listAccounts();
    expect(Object.keys(u!).sort()).toEqual(Object.keys(m!).sort());
  });

  it('both sources expose the same DataSource surface (name, now, list, get)', () => {
    for (const src of [mock, unified]) {
      expect(typeof src.name).toBe('string');
      expect(src.now()).toBeInstanceOf(Date);
      expect(typeof src.listAccounts).toBe('function');
      expect(typeof src.getAccount).toBe('function');
    }
  });

  it('getAccount returns a shape-identical account or null', async () => {
    const got = await unified.getAccount('acct-clean');
    expect(got).not.toBeNull();
    assertAccountShape(got!, 'unified/getAccount');
    expect(await unified.getAccount('does-not-exist')).toBeNull();
  });
});
