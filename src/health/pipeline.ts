import type { DataSource } from '../data';
import { evaluate } from '../engine';
import { DEFAULT_THRESHOLDS, type ThresholdConfig } from '../domain';
import type { EvaluatedAccount } from '../answer';
import { combineEvaluation } from './combine';
import type { SoftSignalExtractor } from '../answer/claude/softSignals';
import type { ReasoningWriter } from '../answer/claude/reasoning';

/**
 * The end-to-end health pipeline: pull accounts from ANY DataSource, run the frozen
 * hard-signal engine, optionally fold in Claude soft signals, and (optionally) write
 * plain-English reasoning for the red accounts.
 *
 * Source-agnostic and engine-frozen: this is the same code whether the DataSource is
 * mock or unified, and it never reimplements risk logic — it calls the engine's
 * `evaluate` and the `combineEvaluation` helper (which reuses the engine's `rollUp`).
 */

export interface PipelineOptions {
  thresholds?: ThresholdConfig;
  /** When present, soft signals are extracted per account and folded into risk. */
  extractor?: SoftSignalExtractor | null;
}

/** Build the evaluated book (hard signals, plus soft signals when an extractor is given). */
export async function buildBook(
  source: DataSource,
  opts: PipelineOptions = {},
): Promise<EvaluatedAccount[]> {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const now = source.now();
  const accounts = await source.listAccounts();

  return Promise.all(
    accounts.map(async (account): Promise<EvaluatedAccount> => {
      const base = evaluate(account, thresholds, now);
      if (!opts.extractor) return { account, evaluation: base };
      const soft = await opts.extractor.extract(account);
      return { account, evaluation: combineEvaluation(base, soft) };
    }),
  );
}

export interface RedAccountReasoning {
  accountId: string;
  reasoning: string;
  /** True when Claude wrote it; false when the deterministic fallback was used. */
  fromModel: boolean;
}

/**
 * Write reasoning for the red accounts in a book. The writer is constrained to the
 * fired signals, so the narration can never invent a risk. Degrades per-account.
 */
export async function writeRedReasoning(
  book: EvaluatedAccount[],
  reasoner: ReasoningWriter,
): Promise<RedAccountReasoning[]> {
  const reds = book.filter((e) => e.evaluation.riskLevel === 'red');
  return Promise.all(
    reds.map(async (e): Promise<RedAccountReasoning> => {
      const res = await reasoner.write(e.account, e.evaluation.signals);
      return { accountId: e.account.id, reasoning: res.text, fromModel: res.fromModel };
    }),
  );
}
