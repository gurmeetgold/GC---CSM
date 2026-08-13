import { describe, it, expect } from 'vitest';
import { growth } from './growth';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // nearLimitPctOfSeats = 90

describe('growth', () => {
  it('fires when utilization reaches the near-limit threshold', () => {
    const s = growth(makeAccount({ licensedSeats: 100, activeUsers: 92 }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('growth_opportunity');
    expect(s!.polarity).toBe('opportunity');
    expect(s!.severity).toBe('info');
  });

  it('fires with the at-limit headline when at or over capacity', () => {
    const s = growth(makeAccount({ licensedSeats: 100, activeUsers: 100 }), T, NOW);
    expect(s!.headline).toMatch(/expansion ready/i);
  });

  it('stays silent when utilization is moderate', () => {
    expect(growth(makeAccount({ licensedSeats: 100, activeUsers: 70 }), T, NOW)).toBeNull();
  });

  // --- boundary: fires at or above 90% ---
  it('fires exactly at the threshold (90%)', () => {
    expect(growth(makeAccount({ licensedSeats: 100, activeUsers: 90 }), T, NOW)).not.toBeNull();
  });

  it('is silent just below the threshold (89%)', () => {
    expect(growth(makeAccount({ licensedSeats: 100, activeUsers: 89 }), T, NOW)).toBeNull();
  });

  // --- abstention cases ---
  it('abstains when there are no licensed seats', () => {
    expect(growth(makeAccount({ licensedSeats: 0, activeUsers: 0 }), T, NOW)).toBeNull();
  });

  it('abstains on cold-start (need established usage before calling expansion)', () => {
    const a = makeAccount({ licensedSeats: 10, activeUsers: 10, createdAt: daysAgo(10) });
    expect(growth(a, T, NOW)).toBeNull();
  });
});
