/**
 * The Claude client seam. Every Claude-backed feature depends only on this
 * interface, so CI injects a deterministic stub and never calls the real API.
 * The HTTP implementation targets the Anthropic Messages API on the
 * zero-data-retention tier.
 */

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCompleteParams {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  /** Default 0 — we want determinism for signal extraction and faithful narration. */
  temperature?: number;
}

export interface ClaudeClient {
  readonly model: string;
  complete(params: ClaudeCompleteParams): Promise<string>;
}

export interface HttpClaudeConfig {
  apiKey: string;
  model: string;
  baseUrl?: string; // default https://api.anthropic.com
  anthropicVersion?: string; // default 2023-06-01
}

/**
 * Production Anthropic client. Server-side only (carries the API key). Assumes the
 * account/workspace is provisioned on the zero-data-retention tier so prompts and
 * completions are not retained by the provider; we additionally never persist raw
 * transcript text ourselves (see DATA_HANDLING.md).
 */
export class HttpClaudeClient implements ClaudeClient {
  readonly model: string;
  constructor(private readonly cfg: HttpClaudeConfig) {
    this.model = cfg.model;
  }

  async complete(params: ClaudeCompleteParams): Promise<string> {
    const base = this.cfg.baseUrl ?? 'https://api.anthropic.com';
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': this.cfg.anthropicVersion ?? '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.cfg.model,
        max_tokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 0,
        system: params.system,
        messages: params.messages,
      }),
    });
    if (!res.ok) {
      throw new Error(`Claude API error: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
  }
}
