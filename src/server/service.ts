import type { AnswerEngine, AnswerResult, EvaluatedAccount } from '../answer';
import { buildBook, writeRedReasoning } from '../health/pipeline';
import { buildAnswerEngine, buildDataSource, buildSoftSignalEnrichment } from './factory';
import type { ServerConfig } from './config';

/**
 * The backend's application service. Assembles the live (or mock) implementations
 * from config ONCE, then serves an evaluated book — hard signals, soft signals folded
 * in when Claude is configured, and plain-English reasoning for the red accounts.
 *
 * Results are cached briefly so a page load doesn't re-hit Salesforce/Gong/Claude on
 * every request. Everything it returns is plain JSON the browser renders directly.
 */

export interface BookPayload {
  sourceName: string;
  answerEngineName: string;
  now: string; // ISO
  accounts: EvaluatedAccount[];
  /** accountId → Claude (or fallback) narrative, for red accounts only. */
  reasoning: Record<string, string>;
}

export class BookService {
  private readonly source;
  private readonly answerEngine: AnswerEngine;
  private readonly enrichment;
  private cache: { at: number; payload: BookPayload } | null = null;

  constructor(
    cfg: ServerConfig,
    private readonly ttlMs = 60_000,
    private readonly clock: () => number = Date.now,
  ) {
    this.source = buildDataSource(cfg);
    this.answerEngine = buildAnswerEngine(cfg);
    this.enrichment = buildSoftSignalEnrichment(cfg);
  }

  async getBook(): Promise<BookPayload> {
    if (this.cache && this.clock() - this.cache.at < this.ttlMs) return this.cache.payload;

    const book = await buildBook(this.source, { extractor: this.enrichment?.extractor ?? null });

    const reasoning: Record<string, string> = {};
    if (this.enrichment) {
      const written = await writeRedReasoning(book, this.enrichment.reasoner);
      for (const r of written) reasoning[r.accountId] = r.reasoning;
    }

    const payload: BookPayload = {
      sourceName: this.source.name,
      answerEngineName: this.answerEngine.name,
      now: this.source.now().toISOString(),
      accounts: book,
      reasoning,
    };
    this.cache = { at: this.clock(), payload };
    return payload;
  }

  async ask(question: string): Promise<AnswerResult> {
    const { accounts } = await this.getBook();
    return this.answerEngine.ask(question, accounts);
  }

  /** For diagnostics: which implementations are live. */
  describe(): { dataSource: string; answerEngine: string; softSignals: boolean } {
    return {
      dataSource: this.source.name,
      answerEngine: this.answerEngine.name,
      softSignals: this.enrichment !== null,
    };
  }
}
