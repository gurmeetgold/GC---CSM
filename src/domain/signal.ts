/**
 * Domain: risk signals and health state.
 *
 * These types are the lingua franca of the whole app. They contain ZERO logic
 * and depend on nothing. Both the signal engine and the UI speak in these terms.
 */

export type RiskLevel = 'green' | 'yellow' | 'red';

/**
 * Hard signals — computed deterministically by the pure engine from account data.
 * These are the crown jewel and are frozen this phase.
 */
export type HardSignalType =
  | 'usage_decline'
  | 'adoption_gap'
  | 'champion_silence'
  | 'renewal_risk'
  | 'support_strain'
  | 'growth_opportunity' // positive / expansion signal
  // Phase 3 hard signals
  | 'engagement_cadence'
  | 'email_responsiveness'
  | 'feature_depth'
  | 'stickiness_decline'
  | 'onboarding_stalled'
  | 'billing_friction';

/**
 * Soft signals — extracted by Claude from call/email text (Phase 2). They are the
 * SAME `Signal` shape as hard signals and flow through the SAME roll-up, so the
 * risk view treats them uniformly. They are the ONLY way LLM output can influence
 * RiskLevel; Claude free-text never sets risk directly.
 */
export type SoftSignalType =
  | 'sentiment_decline'
  | 'champion_disengaging'
  | 'sponsor_disengagement' // exec/economic-buyer stops attending + language (approved Phase 3)
  | 'competitor_mention'
  | 'support_sentiment' // frustration in ticket wording, distinct from support_strain volume (approved Phase 3)
  | 'buying_signal'; // positive / expansion soft signal

export type SignalType = HardSignalType | SoftSignalType;

export type SignalPolarity = 'risk' | 'opportunity';

/** Where a signal came from. Defaults to hard for every Phase 1 signal. */
export type SignalSource = 'hard' | 'soft';

/**
 * Severity drives the roll-up to RiskLevel:
 *   - 'critical' risk signal  → account is red on its own
 *   - 'warning'  risk signal  → contributes to yellow/red stacking
 *   - 'info'                  → informational (e.g. opportunity signals)
 */
export type SignalSeverity = 'info' | 'warning' | 'critical';

/**
 * A fired signal. Carries WHY it fired (the tripped values) so the reasoning
 * screen can render a specific, human-readable explanation — never a bare boolean.
 */
export interface Signal {
  type: SignalType;
  polarity: SignalPolarity;
  severity: SignalSeverity;
  /** Short, scannable summary. e.g. "Usage down 42% over 90 days". */
  headline: string;
  /** Full plain-English sentence for the reasoning view. */
  detail: string;
  /** The concrete values that tripped the threshold — the evidence trail. */
  evidence: Record<string, number | string>;
  /**
   * Provenance. Optional and absent on the frozen hard signals (treated as
   * 'hard'); the soft-signal extractor stamps 'soft'. Lets the UI label
   * LLM-derived signals without changing how the roll-up treats them.
   */
  source?: SignalSource;
}
