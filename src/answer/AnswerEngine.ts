import type { Account } from '../domain';
import type { Evaluation } from '../engine';

/** An account paired with its evaluation — the context the answer engine reasons over. */
export interface EvaluatedAccount {
  account: Account;
  evaluation: Evaluation;
}

/** A compact reference to an account, for rendering answer results as links/rows. */
export interface AnswerAccountRef {
  id: string;
  name: string;
  riskLevel: Evaluation['riskLevel'];
  reason: string;
}

export type AnswerKind = 'list' | 'count' | 'account_detail' | 'summary' | 'unknown';

/** A structured answer — never a naked string, so the UI can render it richly. */
export interface AnswerResult {
  /** Plain-English response. */
  text: string;
  kind: AnswerKind;
  /** Accounts the answer is about (may be empty). */
  accounts: AnswerAccountRef[];
  /** Echoes the interpreted intent — useful for debugging and for the UI. */
  interpretedAs: string;
}

/**
 * The answer-engine seam.
 *
 * `MockAnswerEngine` (deterministic, rule-based) today; `ClaudeAnswerEngine`
 * (LLM-backed) later. Both take the same natural-language question and the same
 * evaluated book of business, and return the same structured `AnswerResult` — so
 * the ask-anything UI never changes when the real engine drops in.
 */
export interface AnswerEngine {
  readonly name: string;
  ask(question: string, context: EvaluatedAccount[]): Promise<AnswerResult>;
}
