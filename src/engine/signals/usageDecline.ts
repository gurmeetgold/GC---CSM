import type { Signal } from '../../domain';
import { isColdStart, round1, type SignalFn } from './types';

/**
 * Usage decline: active users dropped more than `dropPct` over the trailing
 * `windowDays`. Compares the current activeUsers against the earliest snapshot
 * at or before the window start.
 *
 * Abstains (returns null) when: cold-start, no baseline in the window, or the
 * baseline is zero (can't compute a percentage from nothing — that's an
 * adoption story, not a decline story).
 */
export const usageDecline: SignalFn = (account, t, now) => {
  if (isColdStart(account, t, now)) return null;

  const history = account.usageHistory ?? [];
  if (history.length < 2) return null;

  const windowStartMs = now.getTime() - t.usageDecline.windowDays * 86_400_000;

  // Baseline = the newest snapshot at or before the window start; if none is that
  // old, fall back to the oldest snapshot we have (partial window).
  let baseline = history.find((s) => Date.parse(s.asOf) >= windowStartMs) ?? history[0];
  for (const s of history) {
    const ms = Date.parse(s.asOf);
    if (Number.isNaN(ms)) continue;
    if (ms <= windowStartMs) baseline = s;
  }
  if (!baseline || baseline.activeUsers <= 0) return null;

  const current = account.activeUsers;
  const dropPct = ((baseline.activeUsers - current) / baseline.activeUsers) * 100;
  if (dropPct <= t.usageDecline.dropPct) return null;

  const rounded = round1(dropPct);
  const signal: Signal = {
    type: 'usage_decline',
    polarity: 'risk',
    severity: 'critical',
    headline: `Usage down ${rounded}% over ${t.usageDecline.windowDays} days`,
    detail: `Active users fell from ${baseline.activeUsers} to ${current} (${rounded}% drop) over the trailing ${t.usageDecline.windowDays} days, past the ${t.usageDecline.dropPct}% alert threshold.`,
    evidence: {
      from: baseline.activeUsers,
      to: current,
      dropPct: rounded,
      windowDays: t.usageDecline.windowDays,
      thresholdPct: t.usageDecline.dropPct,
    },
  };
  return signal;
};
