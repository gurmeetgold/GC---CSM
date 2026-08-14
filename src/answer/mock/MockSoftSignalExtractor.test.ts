import { describe, it, expect } from 'vitest';
import { MockSoftSignalExtractor } from './MockSoftSignalExtractor';
import { MOCK_ACCOUNTS } from '../../data/mock/accounts';
import { REFERENCE_NOW } from '../../data/mock/referenceTime';
import { evaluate } from '../../engine';
import { combineEvaluation } from '../../health/combine';
import { DEFAULT_THRESHOLDS } from '../../domain';

const extractor = new MockSoftSignalExtractor();
const byId = (id: string) => MOCK_ACCOUNTS.find((a) => a.id === id)!;

describe('MockSoftSignalExtractor', () => {
  it('emits a competitor_mention grounded in the interaction', async () => {
    const signals = await extractor.extract(byId('featuredrop'));
    const comp = signals.find((s) => s.type === 'competitor_mention');
    expect(comp).toBeDefined();
    expect(comp!.source).toBe('soft');
    expect(comp!.severity).toBe('warning'); // clamped
    expect(String(comp!.evidence.quote)).toMatch(/competitor/i);
  });

  it('detects an exec sponsor disengaging', async () => {
    const signals = await extractor.extract(byId('contosopharma'));
    expect(signals.some((s) => s.type === 'sponsor_disengagement')).toBe(true);
  });

  it('detects negative support tone only on support-kind interactions', async () => {
    const signals = await extractor.extract(byId('alpineski'));
    expect(signals.some((s) => s.type === 'support_sentiment')).toBe(true);
  });

  it('detects a positive buying signal as an opportunity (info)', async () => {
    const signals = await extractor.extract(byId('adventureworks'));
    const buy = signals.find((s) => s.type === 'buying_signal');
    expect(buy).toBeDefined();
    expect(buy!.polarity).toBe('opportunity');
    expect(buy!.severity).toBe('info');
  });

  it('returns nothing for an account with no interactions (graceful)', async () => {
    expect(await extractor.extract(byId('treyresearch'))).toEqual([]);
  });

  it('is deterministic', async () => {
    const a = await extractor.extract(byId('featuredrop'));
    const b = await extractor.extract(byId('featuredrop'));
    expect(a).toEqual(b);
  });

  it('SOFT + HARD stack: feature_depth (hard) + competitor_mention (soft) → red', async () => {
    const acct = byId('featuredrop');
    const hard = evaluate(acct, DEFAULT_THRESHOLDS, REFERENCE_NOW);
    expect(hard.riskLevel).toBe('yellow'); // hard-only

    const soft = await extractor.extract(acct);
    const combined = combineEvaluation(hard, soft);
    expect(combined.riskLevel).toBe('red'); // one hard + one soft warning stack
    expect(combined.signals.some((s) => s.type === 'feature_depth')).toBe(true);
    expect(combined.signals.some((s) => s.type === 'competitor_mention')).toBe(true);
  });
});
