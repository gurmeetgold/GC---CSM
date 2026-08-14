import type { Account, RiskLevel, Signal, ThresholdConfig } from '../domain';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { SignalFn } from './signals/types';
import { usageDecline } from './signals/usageDecline';
import { adoptionGap } from './signals/adoptionGap';
import { championSilence } from './signals/championSilence';
import { supportStrain } from './signals/supportStrain';
import { growth } from './signals/growth';
import { engagementCadence } from './signals/engagementCadence';
import { emailResponsiveness } from './signals/emailResponsiveness';
import { featureDepth } from './signals/featureDepth';
import { stickinessDecline } from './signals/stickinessDecline';
import { onboardingStalled } from './signals/onboardingStalled';
import { billingFriction } from './signals/billingFriction';
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
  engagementCadence,
  emailResponsiveness,
  featureDepth,
  stickinessDecline,
  onboardingStalled,
  billingFriction,
];

export interface Evaluation {
  accountId: string;
  riskLevel: RiskLevel;
  /** All fired signals (risk + opportunity), in registry order with renewal last. */
  signals: Signal[];
  evaluatedAt: string;
}

/**
 * Roll fired signals up to a single RiskLevel (Phase 3: renewal is an amplifier).
 *
 * `renewal_risk` is treated as an AMPLIFIER, not a standalone driver, so it never
 * inflates the driver count. Its own severity carries the jeopardy verdict.
 *
 *   red    = any non-renewal CRITICAL driver, OR ≥2 non-renewal WARNING drivers,
 *            OR renewal_risk fired at CRITICAL severity (high-jeopardy renewal).
 *   yellow = exactly one non-renewal warning driver (with at most a warning-tier,
 *            i.e. low-jeopardy, renewal on top), OR a warning-tier renewal alone.
 *   green  = no risk signals.
 *
 * Opportunity signals never affect risk level.
 *
 * The effect: a single warning driver under a far-off, low-value renewal now reads
 * yellow (previously red), while imminent / high-ARR / stacked renewals still red.
 */
export function rollUp(signals: Signal[]): RiskLevel {
  const risks = signals.filter((s) => s.polarity === 'risk');
  if (risks.length === 0) return 'green';

  const renewal = risks.find((s) => s.type === 'renewal_risk');
  const drivers = risks.filter((s) => s.type !== 'renewal_risk');

  const hasCriticalDriver = drivers.some((s) => s.severity === 'critical');
  const warningDrivers = drivers.filter((s) => s.severity === 'warning').length;
  const renewalCritical = renewal?.severity === 'critical';

  if (hasCriticalDriver || warningDrivers >= 2 || renewalCritical) return 'red';
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
