import { isColdStart, type SignalFn } from './types';

/**
 * Feature-depth drop: a previously-used KEY feature has been abandoned — prior
 * usage was meaningful, recent usage has fallen to ~zero. This catches value
 * erosion that raw active-user counts miss (they can stay flat while the customer
 * stops using the thing they bought you for).
 *
 * Reports the single worst-abandoned key feature. Abstains on cold-start and when
 * no key feature had enough prior usage to count as "abandoned".
 */
export const featureDepth: SignalFn = (account, t, now) => {
  if (isColdStart(account, t, now)) return null;

  const cfg = t.featureDepth;
  const nowMs = now.getTime();
  const recentStart = nowMs - cfg.windowDays * 86_400_000;
  const priorStart = recentStart - cfg.windowDays * 86_400_000;

  let worst: { label: string; prior: number; recent: number } | null = null;

  for (const f of account.featureUsage ?? []) {
    if (!f.isKeyFeature) continue;
    let prior = 0;
    let recent = 0;
    for (const point of f.history ?? []) {
      const ms = Date.parse(point.asOf);
      if (Number.isNaN(ms)) continue;
      if (ms >= recentStart && ms <= nowMs) recent += point.uses;
      else if (ms >= priorStart && ms < recentStart) prior += point.uses;
    }
    if (prior >= cfg.minPriorUses && recent <= cfg.abandonedMaxUses) {
      if (!worst || prior > worst.prior) worst = { label: f.label, prior, recent };
    }
  }

  if (!worst) return null;

  return {
    type: 'feature_depth',
    polarity: 'risk',
    severity: 'warning',
    headline: `Key feature abandoned — ${worst.label}`,
    detail: `“${worst.label}” went from ${worst.prior} uses in the prior ${cfg.windowDays} days to ${worst.recent} in the last ${cfg.windowDays} — a core feature they’ve stopped using.`,
    evidence: {
      feature: worst.label,
      priorUses: worst.prior,
      recentUses: worst.recent,
      windowDays: cfg.windowDays,
    },
  };
};
