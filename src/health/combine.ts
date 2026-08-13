import { rollUp, type Evaluation } from '../engine';
import type { Signal } from '../domain';

/**
 * Merge soft signals (from Claude) into a hard-signal Evaluation and recompute the
 * RiskLevel.
 *
 * This is the ONLY place hard and soft signals combine. It deliberately reuses the
 * engine's own exported, frozen `rollUp` — it does not reimplement risk logic — so
 * the crown jewel stays untouched and soft signals are treated by exactly the same
 * rules as hard ones. Claude influences risk ONLY through these typed `Signal`s;
 * free-text never reaches here.
 */
export function combineEvaluation(base: Evaluation, softSignals: Signal[]): Evaluation {
  if (softSignals.length === 0) return base;
  const stamped = softSignals.map((s): Signal => ({ ...s, source: 'soft' }));
  const signals = [...base.signals, ...stamped];
  return {
    ...base,
    signals,
    riskLevel: rollUp(signals),
  };
}
