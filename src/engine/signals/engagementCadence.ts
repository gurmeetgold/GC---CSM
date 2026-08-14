import { isColdStart, type SignalFn } from './types';

/**
 * Dropping engagement cadence: the rhythm of live touchpoints (calls + meetings)
 * has fallen sharply versus the account's OWN prior baseline — e.g. we used to meet
 * biweekly and have since gone quiet.
 *
 * Compares touchpoint count in the recent window against the immediately-prior
 * window. Abstains on cold-start and when the prior baseline is too thin to trust
 * (you can't "slow down" from a cadence you never had).
 */
export const engagementCadence: SignalFn = (account, t, now) => {
  if (isColdStart(account, t, now)) return null;

  const cfg = t.engagementCadence;
  const nowMs = now.getTime();
  const recentStart = nowMs - cfg.recentWindowDays * 86_400_000;
  const priorStart = recentStart - cfg.priorWindowDays * 86_400_000;

  let recent = 0;
  let prior = 0;
  for (const i of account.interactions ?? []) {
    if (i.kind !== 'call' && i.kind !== 'meeting') continue;
    const ms = Date.parse(i.occurredAt);
    if (Number.isNaN(ms)) continue;
    if (ms >= recentStart && ms <= nowMs) recent++;
    else if (ms >= priorStart && ms < recentStart) prior++;
  }

  if (prior < cfg.minPriorTouchpoints) return null; // no baseline to fall from

  const dropPct = ((prior - recent) / prior) * 100;
  if (dropPct < cfg.dropPct) return null;

  return {
    type: 'engagement_cadence',
    polarity: 'risk',
    severity: 'warning',
    headline: `Engagement down — ${recent} touchpoint${recent === 1 ? '' : 's'} vs ${prior}`,
    detail: `Live touchpoints fell from ${prior} in the prior ${cfg.priorWindowDays} days to ${recent} in the last ${cfg.recentWindowDays} — a ${Math.round(dropPct)}% drop past the ${cfg.dropPct}% alert.`,
    evidence: {
      recentTouchpoints: recent,
      priorTouchpoints: prior,
      dropPct: Math.round(dropPct),
      recentWindowDays: cfg.recentWindowDays,
    },
  };
};
