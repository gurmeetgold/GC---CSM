import type { AnswerEngine } from './AnswerEngine';
import { MockAnswerEngine } from './MockAnswerEngine';
import { ClaudeAnswerEngine } from './claude/ClaudeAnswerEngine';
import type { ClaudeClient } from './claude/claudeClient';

export type {
  AnswerEngine,
  AnswerResult,
  AnswerAccountRef,
  AnswerKind,
  EvaluatedAccount,
} from './AnswerEngine';
export { MockAnswerEngine } from './MockAnswerEngine';
export { ClaudeAnswerEngine } from './claude/ClaudeAnswerEngine';

export type AnswerEngineKind = 'mock' | 'claude';

/** Dependencies the Claude engine needs — built server-side (never in the browser). */
export interface ClaudeAnswerDeps {
  claude: ClaudeClient;
}

/**
 * The single selection point for the answer engine. The app depends only on the
 * `AnswerEngine` interface and gets an implementation from here, so it never imports
 * a concrete engine itself. The `mock|claude` switch is INDEPENDENT of the data
 * source switch, so live data can be paired with mock answers (or vice versa) while
 * debugging. `claude` requires an injected client, assembled from secrets by the
 * server-side factory (or a stub in tests).
 */
export function createAnswerEngine(kind: AnswerEngineKind = 'mock', deps?: ClaudeAnswerDeps): AnswerEngine {
  switch (kind) {
    case 'mock':
      return new MockAnswerEngine();
    case 'claude':
      if (!deps?.claude) {
        throw new Error(
          'claude answer engine requires a ClaudeClient. Build it server-side via the ' +
            'server factory; the browser must use ANSWER_ENGINE=mock.',
        );
      }
      return new ClaudeAnswerEngine(deps.claude);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown answer engine: ${String(_exhaustive)}`);
    }
  }
}

/** Resolve the configured answer-engine kind from the environment, defaulting to mock. */
export function resolveAnswerEngineKind(raw: string | undefined): AnswerEngineKind {
  return raw === 'claude' ? 'claude' : 'mock';
}
