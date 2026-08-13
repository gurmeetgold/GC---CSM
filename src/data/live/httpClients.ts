import type { GongClient, MergeClient } from './clients';
import { SourceUnavailableError } from './clients';
import type {
  GongCall,
  MergeAccount,
  MergeContact,
  MergeOpportunity,
  MergeTicket,
} from './vendorTypes';

/**
 * Real HTTP-backed vendor clients. Server-side only — they carry credentials and
 * must never run in the browser bundle. Not exercised in CI (tests use fixture
 * clients); this is the production wiring.
 *
 * Cross-cutting concerns handled here so the mappers stay pure:
 *   - Auth headers from injected config (never logged).
 *   - Cursor pagination collected fully before returning.
 *   - Rate limiting: 429/5xx retried with backoff, honoring Retry-After.
 *   - Any non-recoverable failure → SourceUnavailableError for graceful degradation.
 */

export interface MergeConfig {
  /** Merge pass-through base, e.g. https://api.merge.dev/api/crm/v1 */
  baseUrl: string;
  /** Merge production access key (Authorization: Bearer). */
  accessKey: string;
  /** The linked-account token for this customer's Salesforce connection. */
  accountToken: string;
  /** Merge Ticketing base, when the customer has connected Ticketing. */
  ticketingBaseUrl?: string;
}

export interface GongConfig {
  baseUrl: string; // e.g. https://api.gong.io/v2
  /** Pre-encoded Authorization header value (Basic/Bearer), resolved from secrets. */
  authorization: string;
}

interface RetryOpts {
  maxRetries: number;
  baseDelayMs: number;
}
const DEFAULT_RETRY: RetryOpts = { maxRetries: 4, baseDelayMs: 500 };

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  vendor: 'merge' | 'gong',
  url: string,
  init: RequestInit,
  retry: RetryOpts,
): Promise<Response> {
  let attempt = 0;
  // Retry on 429 and 5xx; respect Retry-After when present.
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= retry.maxRetries) throw new SourceUnavailableError(vendor, `network error: ${String(err)}`);
      await sleep(retry.baseDelayMs * 2 ** attempt);
      attempt++;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retry.maxRetries) {
        throw new SourceUnavailableError(vendor, 'rate-limited or server error after retries', res.status);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : retry.baseDelayMs * 2 ** attempt;
      await sleep(delay);
      attempt++;
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new SourceUnavailableError(vendor, 'authentication failed (token expired or revoked)', res.status);
    }
    if (!res.ok) {
      throw new SourceUnavailableError(vendor, `unexpected response`, res.status);
    }
    return res;
  }
}

/** Collect all pages of a Merge cursor-paginated list endpoint. */
async function mergePaginate<T>(
  cfg: MergeConfig,
  baseUrl: string,
  path: string,
  retry: RetryOpts,
): Promise<T[]> {
  const headers = {
    Authorization: `Bearer ${cfg.accessKey}`,
    'X-Account-Token': cfg.accountToken,
  };
  const out: T[] = [];
  let url: string | null = `${baseUrl}${path}?page_size=100`;
  let guard = 0;
  while (url && guard < 1000) {
    const res = await fetchWithRetry('merge', url, { headers }, retry);
    const body = (await res.json()) as { results?: T[]; next?: string | null };
    if (Array.isArray(body.results)) out.push(...body.results);
    url = body.next ?? null;
    guard++;
  }
  return out;
}

export class HttpMergeClient implements MergeClient {
  readonly vendor = 'merge' as const;
  constructor(private readonly cfg: MergeConfig, private readonly retry: RetryOpts = DEFAULT_RETRY) {}

  listAccounts(): Promise<MergeAccount[]> {
    return mergePaginate<MergeAccount>(this.cfg, this.cfg.baseUrl, '/accounts', this.retry);
  }
  listContacts(): Promise<MergeContact[]> {
    return mergePaginate<MergeContact>(this.cfg, this.cfg.baseUrl, '/contacts', this.retry);
  }
  listOpportunities(): Promise<MergeOpportunity[]> {
    return mergePaginate<MergeOpportunity>(this.cfg, this.cfg.baseUrl, '/opportunities', this.retry);
  }
  async listTickets(): Promise<MergeTicket[]> {
    // Ticketing is optional; if not configured, the customer simply has no tickets.
    if (!this.cfg.ticketingBaseUrl) return [];
    return mergePaginate<MergeTicket>(this.cfg, this.cfg.ticketingBaseUrl, '/tickets', this.retry);
  }
}

export class HttpGongClient implements GongClient {
  readonly vendor = 'gong' as const;
  constructor(private readonly cfg: GongConfig, private readonly retry: RetryOpts = DEFAULT_RETRY) {}

  async listCalls(): Promise<GongCall[]> {
    const headers = { Authorization: this.cfg.authorization, 'Content-Type': 'application/json' };
    const out: GongCall[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const url = `${this.cfg.baseUrl}/calls${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetchWithRetry('gong', url, { headers }, this.retry);
      const body = (await res.json()) as {
        calls?: GongCall[];
        records?: { cursor?: string | null };
      };
      if (Array.isArray(body.calls)) out.push(...body.calls);
      cursor = body.records?.cursor ?? null;
      guard++;
    } while (cursor && guard < 1000);
    return out;
  }
}
