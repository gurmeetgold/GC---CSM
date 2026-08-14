import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalBookProvider, HttpBookProvider } from './bookProvider';

afterEach(() => vi.unstubAllGlobals());

describe('LocalBookProvider', () => {
  it('computes the evaluated mock book in-browser (no network)', async () => {
    const { book, sourceName, now, reasoning } = await new LocalBookProvider().loadBook();
    expect(sourceName).toBe('mock');
    expect(book).toHaveLength(31);
    expect(now).toBeInstanceOf(Date);
    // Evaluations are present and valid.
    expect(book.every((e) => ['green', 'yellow', 'red'].includes(e.evaluation.riskLevel))).toBe(true);
    // Soft signals fold in, and red accounts get narrated reasoning.
    const reds = book.filter((e) => e.evaluation.riskLevel === 'red');
    expect(Object.keys(reasoning).length).toBe(reds.length);
    expect(book.some((e) => e.evaluation.signals.some((s) => s.source === 'soft'))).toBe(true);
  });
});

describe('HttpBookProvider', () => {
  it('fetches and deserializes the evaluated book from the backend', async () => {
    const payload = {
      sourceName: 'unified-api',
      now: '2026-08-13T12:00:00.000Z',
      accounts: [{ account: { id: 'x' }, evaluation: { accountId: 'x', riskLevel: 'red', signals: [], evaluatedAt: 'z' } }],
      reasoning: { x: 'Because reasons.' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));

    const loaded = await new HttpBookProvider('http://localhost:8787').loadBook();
    expect(loaded.sourceName).toBe('unified-api');
    expect(loaded.now.toISOString()).toBe('2026-08-13T12:00:00.000Z');
    expect(loaded.book).toHaveLength(1);
    expect(loaded.reasoning.x).toBe('Because reasons.');
  });

  it('throws on a non-OK backend response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 502 })));
    await expect(new HttpBookProvider('http://localhost:8787').loadBook()).rejects.toThrow(/502/);
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: [], now: '2026-01-01T00:00:00Z', sourceName: 'mock' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await new HttpBookProvider('http://localhost:8787/').loadBook();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/accounts');
  });
});
