import type { Account, RiskLevel, Signal, ThresholdConfig } from '../domain';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { SignalFn } from './signals/types';
import { usageDecline } from './signals/usageDecline';
import { adoptionGap } from './signals/adoptionGap';
import { championSilence } from './signals/championSilence';
import { supportStrain } from './signals/supportStrain';
import { growth } from './signals/growth';
import { renewalRisk } from './signals/renewalRisk';

/**
 * The independent signal registry. Each entry is a pure (account, thresholds, now)
 * function. Adding a new independent signal = appending to this array; the roll-up
 * below needs no changes. `renewal_risk` is intentionally NOT here — it depends on
 * the others and is layered in afterward.
 */
export const SIGNAL_REGISTRY: readonly SignalFn[] = [
  usageDecline,
  adoptionGap,
  championSilence,
  supportStrain,
  growth,
];

export interface Evaluation {
  accountId: string;
  riskLevel: RiskLevel;
  /** All fired signals (risk + opportunity), in registry order with renewal last. */
  signals: Signal[];
  evaluatedAt: string;
}

/**
 * Roll fired signals up to a single RiskLevel.
 *
 *   red    = any critical risk signal, OR ≥2 warning risk signals stacked.
 *            (renewal_risk is critical, so a renewal cliff with active risk → red.)
 *   yellow = exactly one warning risk signal.
 *   green  = no risk signals.
 *
 * Opportunity signals never affect risk level.
 */
export function rollUp(signals: Signal[]): RiskLevel {
  const risks = signals.filter((s) => s.polarity === 'risk');
  if (risks.length === 0) return 'green';

  const hasCritical = risks.some((s) => s.severity === 'critical');
  const warningCount = risks.filter((s) => s.severity === 'warning').length;

  if (hasCritical || warningCount >= 2) return 'red';
  return 'yellow';
}

/**
 * Evaluate a single account. Pure and deterministic: pass `now` to pin the clock
 * (tests always do); it defaults to the real clock for production callers.
 *
 * Defensive by design — a malformed account must degrade to a sane evaluation,
 * never throw. Each signal is isolated so one bad signal can't sink the account.
 */
export function evaluate(
  account: Account,
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS,
  now: Date = new Date(),
): Evaluation {
  const fired: Signal[] = [];

  for (const signal of SIGNAL_REGISTRY) {
    try {
      const result = signal(account, thresholds, now);
      if (result) fired.push(result);
    } catch {
      // A single misbehaving signal must not sink the whole evaluation.
      // It simply does not fire.
    }
  }

  // Layer renewal_risk on top of the independent risk signals.
  try {
    const otherRisks = fired.filter((s) => s.polarity === 'risk');
    const renewal = renewalRisk(account, otherRisks, thresholds, now);
    if (renewal) fired.push(renewal);
  } catch {
    /* ignore — renewal simply does not fire */
  }

  return {
    accountId: account?.id ?? 'unknown',
    riskLevel: rollUp(fired),
    signals: fired,
    evaluatedAt: now.toISOString(),
  };
}
