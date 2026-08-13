import type { Account, Signal, ThresholdConfig } from '../../domain';
import { daysUntil } from '../time';

/**
 * Renewal risk: renewal is within `withinDays` AND at least one other RISK signal
 * has fired. This is an amplifier, not an independent detector — a near renewal is
 * only alarming when something is already wrong. It therefore takes the already-
 * fired risk signals as input rather than living in the independent registry.
 *
 * Because it fires only atop existing risk, its presence is what pushes an account
 * to red in the roll-up (a renewal cliff with active problems).
 *
 * Abstains when: renewal date missing/unparseable, renewal already past, renewal
 * beyond the window, or no other risk signals fired.
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

  const drivers = otherRiskSignals.map((s) => s.type);
  const signal: Signal = {
    type: 'renewal_risk',
    polarity: 'risk',
    severity: 'critical',
    headline: `Renews in ${days} days with active risk`,
    detail: `Renewal is ${days} days out (within the ${t.renewalRisk.withinDays}-day window) while ${otherRiskSignals.length} other risk signal${otherRiskSignals.length === 1 ? '' : 's'} ${otherRiskSignals.length === 1 ? 'is' : 'are'} firing: ${drivers.join(', ')}. This account needs an intervention before the renewal date.`,
    evidence: {
      daysToRenewal: days,
      windowDays: t.renewalRisk.withinDays,
      concurrentRiskCount: otherRiskSignals.length,
      drivers: drivers.join(','),
    },
  };
  return signal;
}
