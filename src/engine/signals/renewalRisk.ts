import type { Account, Signal, ThresholdConfig } from '../../domain';
import { daysUntil } from '../time';

/**
 * Renewal risk (Phase 3: jeopardy-tiered).
 *
 * Still an amplifier: fires only when renewal is within `withinDays` AND at least
 * one other RISK signal has fired — a near renewal is only alarming when something
 * is already wrong.
 *
 * NEW: severity is tiered by jeopardy instead of always-critical. It is CRITICAL
 * when the renewal is imminent (≤ criticalWithinDays), the account is large
 * (arr ≥ highArr), or multiple other risks are stacking (≥ criticalConcurrentRisks);
 * otherwise it is a WARNING. Combined with the tiered roll-up, this lets a far-off,
 * low-ARR, single-risk renewal read yellow instead of red, while an imminent or
 * high-value renewal still reads red.
 *
 * Abstains when: renewal date missing/unparseable, already past, beyond the window,
 * or no other risk signals fired.
 */
export function renewalRisk(
  account: Account,
  otherRiskSignals: Signal[],
  t: ThresholdConfig,
  now: Date,
): Signal | null {
  const days = daysUntil(account.renewalDate, now);
  if (days === null) return null;
  if (days < 0 || days > t.renewalRisk.withinDays) return null;
  if (otherRiskSignals.length === 0) return null;

  const cfg = t.renewalRisk;
  const arr = Number.isFinite(account.arr) ? account.arr : 0;
  const concurrent = otherRiskSignals.length;

  const imminent = days <= cfg.criticalWithinDays;
  const highValue = arr >= cfg.highArr;
  const stacked = concurrent >= cfg.criticalConcurrentRisks;
  const critical = imminent || highValue || stacked;

  // A transparent 0–100 jeopardy score, used to SORT the leadership renewal view.
  const closeness = Math.max(0, Math.min(1, 1 - days / Math.max(1, cfg.withinDays)));
  const valueWeight = Math.max(0, Math.min(1, arr / Math.max(1, cfg.highArr)));
  const stackWeight = Math.max(0, Math.min(1, concurrent / 3));
  const jeopardyScore = Math.round((0.5 * closeness + 0.3 * valueWeight + 0.2 * stackWeight) * 100);

  const drivers = otherRiskSignals.map((s) => s.type);
  const tierReason = critical
    ? imminent
      ? `renews within ${cfg.criticalWithinDays} days`
      : highValue
        ? `high-value renewal ($${arr.toLocaleString('en-US')})`
        : `${concurrent} risks stacking`
    : 'lower-jeopardy renewal';

  return {
    type: 'renewal_risk',
    polarity: 'risk',
    severity: critical ? 'critical' : 'warning',
    headline: `Renews in ${days} days with active risk`,
    detail: `Renewal is ${days} days out (within the ${cfg.withinDays}-day window) while ${concurrent} other risk signal${concurrent === 1 ? '' : 's'} ${concurrent === 1 ? 'is' : 'are'} firing: ${drivers.join(', ')}. Jeopardy: ${critical ? 'high' : 'moderate'} — ${tierReason}.`,
    evidence: {
      daysToRenewal: days,
      windowDays: cfg.withinDays,
      concurrentRiskCount: concurrent,
      arr,
      jeopardyScore,
      tier: critical ? 'critical' : 'warning',
      drivers: drivers.join(','),
    },
  };
}
