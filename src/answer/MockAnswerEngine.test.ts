import { describe, it, expect, beforeAll } from 'vitest';
import { MockAnswerEngine, type EvaluatedAccount } from './index';
import { MOCK_ACCOUNTS } from '../data/mock/accounts';
import { REFERENCE_NOW } from '../data/mock/referenceTime';
import { evaluate } from '../engine';
import { DEFAULT_THRESHOLDS } from '../domain';

/**
 * Light coverage of the mock answer engine — enough to prove the intents route
 * and the responses are deterministic. The heavy correctness testing lives in
 * the engine; this is glue.
 */
describe('MockAnswerEngine', () => {
  const engine = new MockAnswerEngine();
  let book: EvaluatedAccount[];

  beforeAll(() => {
    book = MOCK_ACCOUNTS.map((account) => ({
      account,
      evaluation: evaluate(account, DEFAULT_THRESHOLDS, REFERENCE_NOW),
    }));
  });

  it('is deterministic — same question, same answer', async () => {
    const a = await engine.ask('which accounts are at risk?', book);
    const b = await engine.ask('which accounts are at risk?', book);
    expect(a).toEqual(b);
  });

  it('answers the at-risk intent with the red accounts', async () => {
    const res = await engine.ask('which accounts are at risk?', book);
    expect(res.kind).toBe('list');
    expect(res.accounts.length).toBeGreaterThan(0);
    expect(res.accounts.every((a) => a.riskLevel === 'red')).toBe(true);
  });

  it('answers the expansion intent with growth accounts', async () => {
    const res = await engine.ask('where are the expansion opportunities?', book);
    const names = res.accounts.map((a) => a.name);
    expect(names).toContain('Adventure Works');
  });

  it('answers renewal intent with renewal-risk accounts only', async () => {
    const res = await engine.ask('what renewals are at risk?', book);
    const ids = new Set(res.accounts.map((a) => a.id));
    expect(ids.has('vanarsdel')).toBe(true);
    // Humongous renews soon but has no other risk — must not appear.
    expect(ids.has('humongous')).toBe(false);
  });

  it('answers a specific account by name', async () => {
    const res = await engine.ask('how is Contoso Pharma doing?', book);
    expect(res.kind).toBe('account_detail');
    expect(res.accounts[0]?.id).toBe('contosopharma');
  });

  it('gives a book summary on request', async () => {
    const res = await engine.ask('give me a summary of my book', book);
    expect(res.kind).toBe('summary');
    expect(res.text).toMatch(/red/);
  });

  it('handles an empty question gracefully', async () => {
    const res = await engine.ask('', book);
    expect(res.kind).toBe('unknown');
    expect(res.accounts).toHaveLength(0);
  });
});
