import type { AnswerEngine, AnswerResult, EvaluatedAccount } from '../AnswerEngine';
import { authHeaders } from '../../session/clientSession';

/**
 * Browser-side AnswerEngine that delegates to the backend's /api/ask endpoint, which
 * runs the real Claude engine server-side. Implements the same interface as the mock
 * and Claude engines, so the ask-anything UI is unchanged.
 *
 * The `context` argument is ignored here: the backend already holds the evaluated
 * book (it computed it), so the browser only sends the question.
 */
export class HttpAnswerEngine implements AnswerEngine {
  readonly name = 'http';
  constructor(private readonly baseUrl: string) {}

  async ask(question: string, _context: EvaluatedAccount[]): Promise<AnswerResult> {
    void _context;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/ask`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question }),
    });
    if (!res.ok) {
      return {
        text: 'The answer service is temporarily unavailable. Please try again.',
        kind: 'unknown',
        accounts: [],
        interpretedAs: `backend error (HTTP ${res.status})`,
      };
    }
    return (await res.json()) as AnswerResult;
  }
}
