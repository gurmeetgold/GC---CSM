import { describe, it, expect } from 'vitest';
import { usageDecline } from './usageDecline';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS;

// Baseline pinned to 100 active users at the 90-day mark for clean percentages.
function withUsage(current: number, baseline = 100) {
  return makeAccount({
    activeUsers: current,
    usageHistory: [
      { asOf: daysAgo(120), activeUsers: baseline },
      { asOf: daysAgo(90), activeUsers: baseline },
      { asOf: daysAgo(60), activeUsers: baseline },
      { asOf: daysAgo(30), activeUsers: baseline },
    ],
  });
}

describe('usageDecline', () => {
  it('fires when drop exceeds the threshold', () => {
    const s = usageDecline(withUsage(50), T, NOW); // 50% drop
    expect(s).not.toBeNull();
    expect(s!.type).toBe('usage_decline');
    expect(s!.severity).toBe('critical');
    expect(s!.evidence.dropPct).toBe(50);
  });

  it('stays silent when usage is flat', () => {
    expect(usageDecline(withUsage(100), T, NOW)).toBeNull();
  });

  it('stays silent when usage grew', () => {
    expect(usageDecline(withUsage(120), T, NOW)).toBeNull();
  });

  // --- boundary: threshold is 20%, fires only when strictly greater ---
  it('is silent exactly at the threshold (20% drop)', () => {
    expect(usageDecline(withUsage(80), T, NOW)).toBeNull(); // exactly 20%
  });

  it('fires just above the threshold (21% drop)', () => {
    expect(usageDecline(withUsage(79), T, NOW)).not.toBeNull();
  });

  it('is silent just below the threshold (19% drop)', () => {
    expect(usageDecline(withUsage(81), T, NOW)).toBeNull();
  });

  // --- abstention cases ---
  it('abstains on cold-start (too few snapshots)', () => {
    const a = makeAccount({
      activeUsers: 10,
      usageHistory: [{ asOf: daysAgo(90), activeUsers: 100 }], // 1 snapshot
    });
    expect(usageDecline(a, T, NOW)).toBeNull();
  });

  it('abstains on cold-start (account younger than min age)', () => {
    const a = withUsage(10);
    a.createdAt = daysAgo(10); // 10 days old
    expect(usageDecline(a, T, NOW)).toBeNull();
  });

  it('abstains when baseline is zero (no base to measure against)', () => {
    expect(usageDecline(withUsage(0, 0), T, NOW)).toBeNull();
  });

  it('abstains with empty usage history', () => {
    expect(usageDecline(makeAccount({ usageHistory: [] }), T, NOW)).toBeNull();
  });

  it('honors an overridden threshold (thresholds are data)', () => {
    const strict = { ...T, usageDecline: { windowDays: 90, dropPct: 5 } };
    expect(usageDecline(withUsage(90), strict, NOW)).not.toBeNull(); // 10% > 5%
  });
});
