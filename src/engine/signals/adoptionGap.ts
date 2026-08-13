import type { Signal } from '../../domain';
import { isColdStart, round1, type SignalFn } from './types';

/**
 * Adoption gap: active users are well below licensed seats — the customer is
 * paying for capacity they aren't using, a classic churn precursor.
 *
 * Abstains on cold-start (low utilization in the first weeks is expected ramp,
 * not a gap) and when there are no licensed seats to measure against.
 */
export const adoptionGap: SignalFn = (account, t, now) => {
  if (account.licensedSeats <= 0) return null;
  if (isColdStart(account, t, now)) return null;

  const pct = (account.activeUsers / account.licensedSeats) * 100;
  if (pct >= t.adoptionGap.minActivePctOfSeats) return null;

  const rounded = round1(pct);
  const signal: Signal = {
    type: 'adoption_gap',
    polarity: 'risk',
    severity: 'warning',
    headline: `Only ${rounded}% of seats active`,
    detail: `${account.activeUsers} of ${account.licensedSeats} licensed seats are active (${rounded}%), below the ${t.adoptionGap.minActivePctOfSeats}% healthy-adoption floor.`,
    evidence: {
      activeUsers: account.activeUsers,
      licensedSeats: account.licensedSeats,
      utilizationPct: rounded,
      floorPct: t.adoptionGap.minActivePctOfSeats,
    },
  };
  return signal;
};
