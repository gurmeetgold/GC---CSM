import type { Account, Signal, ThresholdConfig } from '../../domain';

/**
 * The uniform signal contract. Every signal is a pure function of an account,
 * the resolved thresholds, and an injected reference time. Returns the fired
 * Signal, or null if it did not fire.
 *
 * Adding a signal = writing one of these and registering it. The evaluator
 * never needs to change.
 */
export type SignalFn = (account: Account, t: ThresholdConfig, now: Date) => Signal | null;

/** True when the account is too data-thin to trust data-dependent signals. */
export function isColdStart(account: Account, t: ThresholdConfig, now: Date): boolean {
  const created = Date.parse(account.createdAt);
  const ageDays = Number.isNaN(created)
    ? Infinity // no valid creation date → treat as established, not cold-start
    : Math.floor((now.getTime() - created) / 86_400_000);
  const snapshots = account.usageHistory?.length ?? 0;
  return snapshots < t.coldStart.minUsageSnapshots || ageDays < t.coldStart.minAgeDays;
}

/** Round to one decimal place for tidy evidence/headlines. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
