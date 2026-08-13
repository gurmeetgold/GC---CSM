import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpMergeClient, HttpGongClient } from './httpClients';
import { SourceUnavailableError } from './clients';

const FAST = { maxRetries: 3, baseDelayMs: 0 };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const mergeCfg = { baseUrl: 'https://api.merge.dev/api/crm/v1', accessKey: 'k', accountToken: 't' };

describe('HttpMergeClient — real-world resilience', () => {
  it('retries on 429 and honors the recovery (rate limit)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'a' }], next: null }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpMergeClient(mergeCfg, FAST);
    const accounts = await client.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one 429, one success
  });

  it('treats an expired/revoked token (401) as SourceUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'expired' }, 401)));
    const client = new HttpMergeClient(mergeCfg, FAST);
    await expect(client.listAccounts()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('gives up after max retries on persistent 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    const client = new HttpMergeClient(mergeCfg, FAST);
    await expect(client.listAccounts()).rejects.toMatchObject({ status: 503 });
  });

  it('retries transient network errors, then fails cleanly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const client = new HttpMergeClient(mergeCfg, FAST);
    await expect(client.listAccounts()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('collects all pages of a cursor-paginated list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'a' }], next: 'https://api.merge.dev/next' }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'b' }], next: null }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpMergeClient(mergeCfg, FAST);
    const accounts = await client.listAccounts();
    expect(accounts.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('returns no tickets when Ticketing is not connected (no base URL)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const client = new HttpMergeClient(mergeCfg, FAST);
    expect(await client.listTickets()).toEqual([]);
  });
});

describe('HttpGongClient — real-world resilience', () => {
  const gongCfg = { baseUrl: 'https://api.gong.io/v2', authorization: 'Basic z' };

  it('paginates via records.cursor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ calls: [{ id: 'c1' }], records: { cursor: 'next-1' } }))
      .mockResolvedValueOnce(jsonResponse({ calls: [{ id: 'c2' }], records: { cursor: null } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpGongClient(gongCfg, FAST);
    const calls = await client.listCalls();
    expect(calls.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('surfaces a Gong outage as SourceUnavailable (so the source can degrade)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    const client = new HttpGongClient(gongCfg, FAST);
    await expect(client.listCalls()).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});
