import type { ClaudeClient, ClaudeCompleteParams } from '../claudeClient';

/** A ClaudeClient that returns a fixed (or scripted) response — for deterministic CI. */
export class StubClaudeClient implements ClaudeClient {
  readonly model = 'stub-model';
  public lastParams: ClaudeCompleteParams | null = null;
  constructor(private readonly responder: string | ((p: ClaudeCompleteParams) => string)) {}
  async complete(params: ClaudeCompleteParams): Promise<string> {
    this.lastParams = params;
    return typeof this.responder === 'function' ? this.responder(params) : this.responder;
  }
}

/** A ClaudeClient that always throws — for degradation tests. */
export class FailingClaudeClient implements ClaudeClient {
  readonly model = 'stub-model';
  async complete(): Promise<string> {
    throw new Error('claude down');
  }
}
