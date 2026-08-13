import { describe, it, expect } from 'vitest';
import { adoptionGap } from './adoptionGap';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // floor = 50% of seats

describe('adoptionGap', () => {
  it('fires when utilization is below the floor', () => {
    const s = adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 40 }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('adoption_gap');
    expect(s!.severity).toBe('warning');
    expect(s!.evidence.utilizationPct).toBe(40);
  });

  it('stays silent when utilization is healthy', () => {
    expect(adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 75 }), T, NOW)).toBeNull();
  });

  // --- boundary: floor is 50%, fires only when strictly below ---
  it('is silent exactly at the floor (50%)', () => {
    expect(adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 50 }), T, NOW)).toBeNull();
  });

  it('fires just below the floor (49%)', () => {
    expect(adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 49 }), T, NOW)).not.toBeNull();
  });

  it('is silent just above the floor (51%)', () => {
    expect(adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 51 }), T, NOW)).toBeNull();
  });

  // --- abstention cases ---
  it('abstains when there are no licensed seats', () => {
    expect(adoptionGap(makeAccount({ licensedSeats: 0, activeUsers: 0 }), T, NOW)).toBeNull();
  });

  it('abstains on cold-start (expected ramp, not a gap)', () => {
    const a = makeAccount({
      licensedSeats: 100,
      activeUsers: 5,
      createdAt: daysAgo(10), // 10 days old
    });
    expect(adoptionGap(a, T, NOW)).toBeNull();
  });

  it('honors an overridden floor', () => {
    const strict = { ...T, adoptionGap: { minActivePctOfSeats: 80 } };
    expect(adoptionGap(makeAccount({ licensedSeats: 100, activeUsers: 75 }), strict, NOW)).not.toBeNull();
  });
});
