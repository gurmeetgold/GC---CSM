/**
 * Domain: thresholds are DATA, not code.
 *
 * Every number the signal engine keys off lives here. A later admin panel can
 * supply a partial override (per customer) that is deep-merged over the defaults —
 * without touching a single line of signal logic.
 */

export interface ThresholdConfig {
  /** Usage decline fires when the trailing drop exceeds `dropPct` over `windowDays`. */
  usageDecline: { windowDays: number; dropPct: number };
  /** Adoption gap fires when active users are below `minActivePctOfSeats` of seats. */
  adoptionGap: { minActivePctOfSeats: number };
  /** Champion silence fires when days since last champion contact exceed the max. */
  championSilence: { maxDaysSinceContact: number };
  /** Renewal risk fires when renewal is within `withinDays` AND ≥1 other risk fires. */
  renewalRisk: { withinDays: number };
  /** Support strain fires when open OR critical tickets exceed their caps. */
  supportStrain: { maxOpenTickets: number; maxCriticalTickets: number };
  /** Growth (opportunity) fires when active users reach `nearLimitPctOfSeats` of seats. */
  growth: { nearLimitPctOfSeats: number };
  /**
   * Cold-start guard: an account with fewer than `minUsageSnapshots` snapshots
   * OR younger than `minAgeDays` is treated as data-thin. Data-dependent signals
   * abstain rather than guess, so a new account can't be falsely painted red.
   */
  coldStart: { minUsageSnapshots: number; minAgeDays: number };
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  usageDecline: { windowDays: 90, dropPct: 20 },
  adoptionGap: { minActivePctOfSeats: 50 },
  championSilence: { maxDaysSinceContact: 45 },
  renewalRisk: { withinDays: 60 },
  supportStrain: { maxOpenTickets: 8, maxCriticalTickets: 1 },
  growth: { nearLimitPctOfSeats: 90 },
  coldStart: { minUsageSnapshots: 2, minAgeDays: 30 },
};

/** Recursive partial for admin-panel overrides. */
export type ThresholdOverride = {
  [K in keyof ThresholdConfig]?: Partial<ThresholdConfig[K]>;
};

/**
 * Deep-merge a partial override over the defaults. Pure; returns a fresh object.
 * A later admin panel calls this with per-customer overrides.
 */
export function resolveThresholds(override?: ThresholdOverride): ThresholdConfig {
  if (!override) return DEFAULT_THRESHOLDS;
  const out = {} as ThresholdConfig;
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof ThresholdConfig)[]) {
    out[key] = { ...DEFAULT_THRESHOLDS[key], ...(override[key] ?? {}) } as never;
  }
  return out;
}
