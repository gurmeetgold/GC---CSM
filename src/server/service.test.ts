import { describe, it, expect } from 'vitest';
import { BookService } from './service';
import { resolveServerConfig } from './config';

/**
 * BookService on the mock config — proves the backend assembles the same evaluated
 * book the browser would compute locally, and that caching works. No credentials.
 */
describe('BookService (mock config)', () => {
  it('serves the full evaluated mock book', async () => {
    const svc = new BookService(resolveServerConfig({}));
    const payload = await svc.getBook();
    expect(payload.sourceName).toBe('mock');
    expect(payload.answerEngineName).toBe('mock');
    expect(payload.accounts).toHaveLength(25);
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const e of payload.accounts) counts[e.evaluation.riskLevel]++;
    expect(counts).toEqual({ red: 7, yellow: 5, green: 13 });
  });

  it('answers questions over the served book', async () => {
    const svc = new BookService(resolveServerConfig({}));
    const res = await svc.ask('which accounts are at risk?');
    expect(res.kind).toBe('list');
    expect(res.accounts.every((a) => a.riskLevel === 'red')).toBe(true);
  });

  it('caches within the TTL and refreshes after it', async () => {
    let t = 1_000;
    const svc = new BookService(resolveServerConfig({}), 60_000, () => t);
    const a = await svc.getBook();
    const b = await svc.getBook(); // within TTL → same cached object
    expect(b).toBe(a);
    t += 61_000;
    const c = await svc.getBook(); // past TTL → rebuilt
    expect(c).not.toBe(a);
  });

  it('reports which implementations are live', () => {
    const svc = new BookService(resolveServerConfig({}));
    expect(svc.describe()).toEqual({ dataSource: 'mock', answerEngine: 'mock', softSignals: false });
  });
});
