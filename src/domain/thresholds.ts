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
  /**
   * Renewal risk fires when renewal is within `withinDays` AND ≥1 other risk fires.
   * Severity is then tiered by jeopardy (Phase 3): critical when the renewal is
   * within `criticalWithinDays`, OR the account's ARR ≥ `highArr`, OR ≥
   * `criticalConcurrentRisks` other risks are firing; otherwise a warning.
   */
  renewalRisk: {
    withinDays: number;
    criticalWithinDays: number;
    highArr: number;
    criticalConcurrentRisks: number;
  };
  /** Support strain fires when open OR critical tickets exceed their caps. */
  supportStrain: { maxOpenTickets: number; maxCriticalTickets: number };
  /** Growth (opportunity) fires when active users reach `nearLimitPctOfSeats` of seats. */
  growth: { nearLimitPctOfSeats: number };
  /** Engagement cadence: touchpoints in the recent window fell ≥ dropPct vs. the prior window. */
  engagementCadence: {
    recentWindowDays: number;
    priorWindowDays: number;
    minPriorTouchpoints: number;
    dropPct: number;
  };
  /** Email responsiveness: latest reply latency above cap OR reply-rate below floor. */
  emailResponsiveness: { windowDays: number; maxMedianReplyHours: number; minReplyRatePct: number };
  /** Feature depth: a key feature with prior use ≥ minPriorUses dropped to ≤ abandonedMaxUses. */
  featureDepth: { windowDays: number; minPriorUses: number; abandonedMaxUses: number };
  /** Stickiness: logins-per-active-user fell > dropPct over the window, given a real baseline. */
  stickiness: { windowDays: number; dropPct: number; minBaselineLoginsPerUser: number };
  /** Onboarding stalled: not activated, past the activation window but within the new-account horizon. */
  onboarding: { targetActivationDays: number; staleUntilDays: number };
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
  renewalRisk: { withinDays: 60, criticalWithinDays: 30, highArr: 250_000, criticalConcurrentRisks: 2 },
  supportStrain: { maxOpenTickets: 8, maxCriticalTickets: 1 },
  growth: { nearLimitPctOfSeats: 90 },
  engagementCadence: { recentWindowDays: 60, priorWindowDays: 60, minPriorTouchpoints: 2, dropPct: 50 },
  emailResponsiveness: { windowDays: 60, maxMedianReplyHours: 72, minReplyRatePct: 50 },
  featureDepth: { windowDays: 60, minPriorUses: 5, abandonedMaxUses: 0 },
  stickiness: { windowDays: 90, dropPct: 30, minBaselineLoginsPerUser: 1 },
  onboarding: { targetActivationDays: 45, staleUntilDays: 365 },
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
