import { createDataSource, resolveDataSourceKind, type SourceConnection } from '../data';
import type { EvaluatedAccount } from '../answer';
import { MockSoftSignalExtractor } from '../answer/mock/MockSoftSignalExtractor';
import { MockReasoningWriter } from '../answer/mock/MockReasoningWriter';
import { buildBook, writeRedReasoning } from '../health/pipeline';

/**
 * Where the browser gets the evaluated book from. Two providers, chosen at the
 * composition root — the UI depends only on this seam and can't tell them apart:
 *
 *   - LocalBookProvider: runs the mock source + engine entirely in the browser.
 *     The zero-credential, zero-backend instant demo (Phase 1 behavior).
 *   - HttpBookProvider: fetches a pre-evaluated book from the backend, which runs
 *     the live source + Claude soft signals + reasoning server-side.
 *
 * Selection is by the presence of VITE_BACKEND_URL — configuration, not a type
 * branch in logic.
 */

export interface LoadedBook {
  book: EvaluatedAccount[];
  now: Date;
  sourceName: string;
  /** accountId → narrative reasoning (red accounts). Empty in local mock mode. */
  reasoning: Record<string, string>;
  /** Per-source connection status for the UI's honest "connected / not connected" indicator. */
  connections: SourceConnection[];
}

export interface BookProvider {
  loadBook(): Promise<LoadedBook>;
}

/**
 * In-browser: mock data + the pure engine + deterministic soft signals and
 * reasoning. No network, no credentials — the full experience (hard + soft signals,
 * narrated red accounts) runs entirely client-side.
 */
export class LocalBookProvider implements BookProvider {
  async loadBook(): Promise<LoadedBook> {
    // Always mock in the browser — the live source is server-side only.
    const source = createDataSource(resolveDataSourceKind('mock'));
    const now = source.now();
    const book = await buildBook(source, { extractor: new MockSoftSignalExtractor() });
    const written = await writeRedReasoning(book, new MockReasoningWriter());
    const reasoning: Record<string, string> = {};
    for (const r of written) reasoning[r.accountId] = r.reasoning;
    return { book, now, sourceName: source.name, reasoning, connections: source.connections() };
  }
}

/** Fetches the evaluated book from the backend host. */
export class HttpBookProvider implements BookProvider {
  constructor(private readonly baseUrl: string) {}

  async loadBook(): Promise<LoadedBook> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/accounts`);
    if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
    const data = (await res.json()) as {
      accounts: EvaluatedAccount[];
      now: string;
      sourceName: string;
      reasoning?: Record<string, string>;
      connections?: SourceConnection[];
    };
    return {
      book: data.accounts,
      now: new Date(data.now),
      sourceName: data.sourceName,
      reasoning: data.reasoning ?? {},
      connections: data.connections ?? [],
    };
  }
}

/** The configured backend base URL, if any (build-time). */
export function backendUrl(): string | undefined {
  const url = import.meta.env.VITE_BACKEND_URL;
  return url && url.trim() ? url.trim() : undefined;
}

export function resolveBookProvider(): BookProvider {
  const url = backendUrl();
  return url ? new HttpBookProvider(url) : new LocalBookProvider();
}
