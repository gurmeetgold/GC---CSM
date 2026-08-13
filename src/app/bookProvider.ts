import { createDataSource, resolveDataSourceKind } from '../data';
import { evaluate } from '../engine';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { EvaluatedAccount } from '../answer';

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
}

export interface BookProvider {
  loadBook(): Promise<LoadedBook>;
}

/** In-browser: mock data + the pure engine. No network, no credentials. */
export class LocalBookProvider implements BookProvider {
  async loadBook(): Promise<LoadedBook> {
    // Always mock in the browser — the live source is server-side only.
    const source = createDataSource(resolveDataSourceKind('mock'));
    const now = source.now();
    const accounts = await source.listAccounts();
    const book = accounts.map((account) => ({
      account,
      evaluation: evaluate(account, DEFAULT_THRESHOLDS, now),
    }));
    return { book, now, sourceName: source.name, reasoning: {} };
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
    };
    return {
      book: data.accounts,
      now: new Date(data.now),
      sourceName: data.sourceName,
      reasoning: data.reasoning ?? {},
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
