import type { Account, Signal } from '../../domain';
import { deterministicSummary, type ReasoningResult, type ReasoningWriter } from '../claude/reasoning';

/**
 * Deterministic reasoning writer for the mock / demo path. It composes the "why"
 * straight from the fired signals via `deterministicSummary` — trivially faithful
 * (it can only reference signals that actually fired) and credential-free.
 *
 * Same interface as ClaudeReasoningWriter, so the demo and live paths are
 * interchangeable and the UI never changes.
 */
export class MockReasoningWriter implements ReasoningWriter {
  async write(account: Account, firedSignals: Signal[]): Promise<ReasoningResult> {
    return { text: deterministicSummary(account, firedSignals), fromModel: false };
  }
}
