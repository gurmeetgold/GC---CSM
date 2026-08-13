/**
 * Domain: risk signals and health state.
 *
 * These types are the lingua franca of the whole app. They contain ZERO logic
 * and depend on nothing. Both the signal engine and the UI speak in these terms.
 */

export type RiskLevel = 'green' | 'yellow' | 'red';

export type SignalType =
  | 'usage_decline'
  | 'adoption_gap'
  | 'champion_silence'
  | 'renewal_risk'
  | 'support_strain'
  | 'growth_opportunity'; // positive / expansion signal

export type SignalPolarity = 'risk' | 'opportunity';

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
}
