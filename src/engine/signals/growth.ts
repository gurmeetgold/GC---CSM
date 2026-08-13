import type { Signal } from '../../domain';
import { isColdStart, round1, type SignalFn } from './types';

/**
 * Growth opportunity (positive signal): active usage is at or near the licensed
 * seat limit — the account is bumping the ceiling and is a strong expansion
 * candidate. Opportunity signals never worsen RiskLevel; a healthy account can
 * simultaneously be a growth account.
 *
 * Abstains on cold-start (need established usage before calling expansion) and
 * when there are no seats to measure against.
 */
export const growth: SignalFn = (account, t, now) => {
  if (account.licensedSeats <= 0) return null;
  if (isColdStart(account, t, now)) return null;

  const pct = (account.activeUsers / account.licensedSeats) * 100;
  if (pct < t.growth.nearLimitPctOfSeats) return null;

  const rounded = round1(pct);
  const atOrOver = account.activeUsers >= account.licensedSeats;
  const signal: Signal = {
    type: 'growth_opportunity',
    polarity: 'opportunity',
    severity: 'info',
    headline: atOrOver
      ? `At seat limit — expansion ready`
      : `${rounded}% of seats active — near limit`,
    detail: atOrOver
      ? `${account.activeUsers} active users against ${account.licensedSeats} licensed seats — the account is at or over capacity and primed for a seat expansion.`
      : `${account.activeUsers} of ${account.licensedSeats} seats are active (${rounded}%), approaching the licensed limit — a good moment to discuss expansion.`,
    evidence: {
      activeUsers: account.activeUsers,
      licensedSeats: account.licensedSeats,
      utilizationPct: rounded,
      nearLimitPct: t.growth.nearLimitPctOfSeats,
    },
  };
  return signal;
};
