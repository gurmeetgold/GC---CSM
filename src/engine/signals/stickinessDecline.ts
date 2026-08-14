import type { UsageSnapshot } from '../../domain';
import { isColdStart, round1, type SignalFn } from './types';

/**
 * Login/stickiness decline: logins per active user are trending down — the same
 * people are opening the product less often. This is distinct from raw active-user
 * count: headcount can hold steady while depth of use erodes.
 *
 * Compares stickiness (logins / activeUsers) at the window baseline vs. the latest
 * snapshot. Needs the optional `logins` on snapshots; abstains when absent, on
 * cold-start, and when the baseline stickiness is too low to be meaningful.
 */
export const stickinessDecline: SignalFn = (account, t, now) => {
  if (isColdStart(account, t, now)) return null;

  const cfg = t.stickiness;
  const windowStart = now.getTime() - cfg.windowDays * 86_400_000;

  const withLogins = (account.usageHistory ?? [])
    .filter((s): s is Required<UsageSnapshot> => typeof s.logins === 'number' && s.activeUsers > 0)
    .filter((s) => !Number.isNaN(Date.parse(s.asOf)))
    .sort((a, b) => Date.parse(a.asOf) - Date.parse(b.asOf));

  if (withLogins.length < 2) return null;

  const stickiness = (s: Required<UsageSnapshot>) => s.logins / s.activeUsers;

  // Baseline = latest snapshot at/before the window start, else the oldest we have.
  let baseline = withLogins[0]!;
  for (const s of withLogins) {
    if (Date.parse(s.asOf) <= windowStart) baseline = s;
  }
  const latest = withLogins[withLogins.length - 1]!;
  if (latest === baseline) return null;

  const base = stickiness(baseline);
  const current = stickiness(latest);
  if (base < cfg.minBaselineLoginsPerUser) return null; // no real habit to lose

  const dropPct = ((base - current) / base) * 100;
  if (dropPct <= cfg.dropPct) return null;

  return {
    type: 'stickiness_decline',
    polarity: 'risk',
    severity: 'warning',
    headline: `Stickiness down ${round1(dropPct)}%`,
    detail: `Logins per active user fell from ${round1(base)} to ${round1(current)} (${round1(dropPct)}%) over ${cfg.windowDays} days — the same users are showing up less often.`,
    evidence: {
      baselineLoginsPerUser: round1(base),
      currentLoginsPerUser: round1(current),
      dropPct: round1(dropPct),
      windowDays: cfg.windowDays,
    },
  };
};
