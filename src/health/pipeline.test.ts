import { describe, it, expect } from 'vitest';
import { buildBook, writeRedReasoning } from './pipeline';
import { UnifiedApiDataSource } from '../data/live/UnifiedApiDataSource';
import { MockDataSource } from '../data/mock/MockDataSource';
import { makeMergeClient, makeGongClient } from '../data/live/__fixtures__/vendorFixtures';
import { ClaudeSoftSignalExtractor } from '../answer/claude/softSignals';
import { ClaudeReasoningWriter } from '../answer/claude/reasoning';
import { StubClaudeClient } from '../answer/claude/__fixtures__/stubClaude';
import type { Account } from '../domain';

/**
 * End-to-end pipeline over the LIVE (fixture-backed) source — the full Phase 2 path
 * without touching a real API: unified data → hard signals → soft signals → reasoning.
 */
describe('health pipeline (end-to-end, fixture-backed live source)', () => {
  const unified = new UnifiedApiDataSource(makeMergeClient(), makeGongClient());

  it('builds a book of hard-signal evaluations from the live source', async () => {
    const book = await buildBook(unified);
    expect(book.length).toBe(4);
    for (const e of book) {
      expect(['green', 'yellow', 'red']).toContain(e.evaluation.riskLevel);
      expect(e.account.id).toBe(e.evaluation.accountId);
    }
  });

  it('produces the SAME pipeline output shape for the mock source (parity)', async () => {
    const mockBook = await buildBook(new MockDataSource());
    const liveBook = await buildBook(unified);
    const keysOf = (o: object) => Object.keys(o).sort();
    expect(keysOf(liveBook[0]!)).toEqual(keysOf(mockBook[0]!));
    expect(keysOf(liveBook[0]!.evaluation)).toEqual(keysOf(mockBook[0]!.evaluation));
  });

  it('folds soft signals into risk when an extractor is supplied', async () => {
    // Claude stub emits a competitor mention for accounts that have interaction text.
    const stub = new StubClaudeClient((p) => {
      const hasText = p.messages[0]?.content.includes('asked about adding seats');
      return hasText
        ? JSON.stringify([{ type: 'competitor_mention', severity: 'warning', headline: 'Competitor', detail: 'd', quote: 'seats' }])
        : '[]';
    });
    const extractor = new ClaudeSoftSignalExtractor(stub);

    const withoutSoft = await buildBook(unified);
    const withSoft = await buildBook(unified, { extractor });

    const clean = (b: typeof withSoft) => b.find((e) => e.account.id === 'acct-clean')!;
    // acct-clean is healthy on hard signals; the soft competitor mention is added.
    expect(clean(withoutSoft).evaluation.signals.some((s) => s.source === 'soft')).toBe(false);
    expect(clean(withSoft).evaluation.signals.some((s) => s.type === 'competitor_mention')).toBe(true);
  });

  it('writes faithful reasoning for red accounts', async () => {
    // Force a red account by using a source whose only account has stacked hard signals.
    const redAccount: Account = {
      id: 'red-1', name: 'Red One', segment: 'enterprise', arr: 300000, renewalDate: '2026-09-01',
      licensedSeats: 100, activeUsers: 30,
      usageHistory: [{ asOf: '2026-04-15', activeUsers: 90 }, { asOf: '2026-05-15', activeUsers: 30 }],
      contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: '2026-05-01' }],
      interactions: [], openTickets: 0, criticalTickets: 0, createdAt: '2023-01-01',
    };
    const src = new MockDataSource([redAccount]);
    const book = await buildBook(src);
    expect(book[0]!.evaluation.riskLevel).toBe('red');

    const stub = new StubClaudeClient('Red One is at risk due to a steep usage decline and low seat adoption.');
    const reasoning = await writeRedReasoning(book, new ClaudeReasoningWriter(stub));
    expect(reasoning).toHaveLength(1);
    expect(reasoning[0]!.accountId).toBe('red-1');
    expect(reasoning[0]!.reasoning).toMatch(/Red One/);
  });
});
