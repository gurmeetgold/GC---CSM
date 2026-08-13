import { describe, it, expect } from 'vitest';
import { parseSoftSignals, ClaudeSoftSignalExtractor, buildInteractionText } from './softSignals';
import { StubClaudeClient, FailingClaudeClient } from './__fixtures__/stubClaude';
import type { Account } from '../../domain';

function accountWith(interactions: Account['interactions']): Account {
  return {
    id: 'a', name: 'Acct', segment: 'mid_market', arr: 100000, renewalDate: '2026-12-01',
    licensedSeats: 100, activeUsers: 80, usageHistory: [], contacts: [], interactions,
    openTickets: 0, criticalTickets: 0, createdAt: '2024-01-01',
  };
}

const withCalls = accountWith([
  { id: 'i1', occurredAt: '2026-08-01', kind: 'call', summary: 'Customer mentioned they are evaluating a competitor and sounded frustrated.' },
]);

describe('parseSoftSignals (validation + clamping)', () => {
  it('parses valid soft signals and stamps source=soft', () => {
    const raw = JSON.stringify([
      { type: 'competitor_mention', severity: 'warning', headline: 'Competitor named', detail: 'They mentioned a rival.', quote: 'evaluating a competitor' },
    ]);
    const out = parseSoftSignals(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('competitor_mention');
    expect(out[0]!.source).toBe('soft');
    expect(out[0]!.polarity).toBe('risk');
    expect(out[0]!.evidence.quote).toBe('evaluating a competitor');
  });

  it('clamps a risk soft signal that claims critical down to warning', () => {
    const raw = JSON.stringify([{ type: 'sentiment_decline', severity: 'critical', headline: 'x', detail: 'y' }]);
    const out = parseSoftSignals(raw);
    expect(out[0]!.severity).toBe('warning'); // never critical from the LLM
  });

  it('forces opportunity soft signals to info severity', () => {
    const raw = JSON.stringify([{ type: 'buying_signal', severity: 'warning', headline: 'x', detail: 'y' }]);
    const out = parseSoftSignals(raw);
    expect(out[0]!.polarity).toBe('opportunity');
    expect(out[0]!.severity).toBe('info');
  });

  it('drops elements with unknown/invalid types', () => {
    const raw = JSON.stringify([
      { type: 'not_a_real_type', severity: 'warning', headline: 'x', detail: 'y' },
      { type: 'sentiment_decline', severity: 'warning', headline: 'ok', detail: 'z' },
    ]);
    expect(parseSoftSignals(raw)).toHaveLength(1);
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n[{"type":"sentiment_decline","severity":"warning","headline":"h","detail":"d"}]\n```';
    expect(parseSoftSignals(raw)).toHaveLength(1);
  });

  it('returns [] on non-JSON garbage without throwing', () => {
    expect(parseSoftSignals('the model refused to answer')).toEqual([]);
    expect(parseSoftSignals('')).toEqual([]);
  });
});

describe('ClaudeSoftSignalExtractor', () => {
  it('extracts signals via the injected client', async () => {
    const stub = new StubClaudeClient(
      JSON.stringify([{ type: 'competitor_mention', severity: 'warning', headline: 'Competitor', detail: 'd', quote: 'competitor' }]),
    );
    const out = await new ClaudeSoftSignalExtractor(stub).extract(withCalls);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('competitor_mention');
  });

  it('returns [] for an account with no interaction text (never calls the model)', async () => {
    const stub = new StubClaudeClient('[]');
    const out = await new ClaudeSoftSignalExtractor(stub).extract(accountWith([]));
    expect(out).toEqual([]);
    expect(stub.lastParams).toBeNull(); // short-circuited
  });

  it('degrades to [] when the model call fails (hard signals still stand)', async () => {
    const out = await new ClaudeSoftSignalExtractor(new FailingClaudeClient()).extract(withCalls);
    expect(out).toEqual([]);
  });

  it('bounds the interaction text it sends', () => {
    const many = accountWith(
      Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, occurredAt: '2026-08-01', kind: 'call' as const, summary: `call ${i}` })),
    );
    const lines = buildInteractionText(many).split('\n');
    expect(lines.length).toBeLessThanOrEqual(25);
  });
});
