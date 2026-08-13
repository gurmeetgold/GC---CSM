import type { AnswerEngine } from './AnswerEngine';
import { MockAnswerEngine } from './MockAnswerEngine';

export type {
  AnswerEngine,
  AnswerResult,
  AnswerAccountRef,
  AnswerKind,
  EvaluatedAccount,
} from './AnswerEngine';
export { MockAnswerEngine } from './MockAnswerEngine';

export type AnswerEngineKind = 'mock' | 'claude';

/**
 * The single selection point for the answer engine — the app depends only on the
 * `AnswerEngine` interface and gets an implementation from here, so it never
 * imports a concrete engine itself. `ClaudeAnswerEngine` drops in beside the mock
 * in Phase 2 with no UI change.
 */
export function createAnswerEngine(kind: AnswerEngineKind = 'mock'): AnswerEngine {
  switch (kind) {
    case 'mock':
      return new MockAnswerEngine();
    case 'claude':
      throw new Error(
        'ClaudeAnswerEngine is not available in Phase 1. It implements the same ' +
          'AnswerEngine interface and drops in here in Phase 2.',
      );
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown answer engine: ${String(_exhaustive)}`);
    }
  }
}
