import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpAnswerEngine } from './HttpAnswerEngine';

afterEach(() => vi.unstubAllGlobals());

describe('HttpAnswerEngine', () => {
  it('POSTs the question to the backend and returns its AnswerResult', async () => {
    const result = { text: 'Alpha is at risk.', kind: 'list', accounts: [{ id: 'a1', name: 'Alpha', riskLevel: 'red', reason: 'x' }], interpretedAs: 'claude' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await new HttpAnswerEngine('http://localhost:8787').ask('who is at risk?', []);
    expect(res.text).toBe('Alpha is at risk.');
    expect(res.accounts[0]!.id).toBe('a1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:8787/api/ask');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ question: 'who is at risk?' });
  });

  it('degrades gracefully on a backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 502 })));
    const res = await new HttpAnswerEngine('http://localhost:8787').ask('q', []);
    expect(res.kind).toBe('unknown');
    expect(res.text).toMatch(/unavailable/i);
  });
});
