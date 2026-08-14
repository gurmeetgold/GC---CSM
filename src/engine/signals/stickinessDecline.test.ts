import { describe, it, expect } from 'vitest';
import { stickinessDecline } from './stickinessDecline';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { UsageSnapshot } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // window 90d, dropPct 30, minBaselineLoginsPerUser 1

function snap(d: number, activeUsers: number, logins: number): UsageSnapshot {
  return { asOf: daysAgo(d), activeUsers, logins };
}
// baseline snapshot at/before 90d; latest is newest.
function withStickiness(baseLoginsPerUser: number, currentLoginsPerUser: number) {
  return makeAccount({
    usageHistory: [
      snap(120, 10, baseLoginsPerUser * 10),
      snap(90, 10, baseLoginsPerUser * 10),
      snap(20, 10, currentLoginsPerUser * 10),
    ],
  });
}

describe('stickinessDecline', () => {
  it('fires when logins-per-user drops sharply', () => {
    const s = stickinessDecline(withStickiness(4, 2), T, NOW); // 50% drop
    expect(s).not.toBeNull();
    expect(s!.type).toBe('stickiness_decline');
    expect(s!.evidence.baselineLoginsPerUser).toBe(4);
    expect(s!.evidence.currentLoginsPerUser).toBe(2);
  });

  it('stays silent when stickiness holds', () => {
    expect(stickinessDecline(withStickiness(4, 4), T, NOW)).toBeNull();
  });

  // boundary at 30%
  it('is silent exactly at the drop threshold (30%)', () => {
    expect(stickinessDecline(withStickiness(10, 7), T, NOW)).toBeNull(); // 30%
  });

  it('fires just above the threshold (31%)', () => {
    expect(stickinessDecline(withStickiness(10, 6.9), T, NOW)).not.toBeNull();
  });

  it('is silent just below the threshold (29%)', () => {
    expect(stickinessDecline(withStickiness(10, 7.1), T, NOW)).toBeNull();
  });

  it('abstains when baseline stickiness is below the minimum (no real habit)', () => {
    expect(stickinessDecline(withStickiness(0.5, 0.1), T, NOW)).toBeNull();
  });

  it('abstains when snapshots lack login data', () => {
    const acct = makeAccount({
      usageHistory: [{ asOf: daysAgo(90), activeUsers: 10 }, { asOf: daysAgo(20), activeUsers: 10 }],
    });
    expect(stickinessDecline(acct, T, NOW)).toBeNull();
  });

  it('abstains on cold-start', () => {
    const a = withStickiness(4, 1);
    a.createdAt = daysAgo(10);
    expect(stickinessDecline(a, T, NOW)).toBeNull();
  });
});
