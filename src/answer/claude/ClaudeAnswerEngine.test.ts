import { describe, it, expect } from 'vitest';
import { ClaudeAnswerEngine, parseAnswer } from './ClaudeAnswerEngine';
import { StubClaudeClient, FailingClaudeClient } from './__fixtures__/stubClaude';
import type { EvaluatedAccount } from '../AnswerEngine';
import type { Account } from '../../domain';

function evAccount(id: string, name: string, risk: 'green' | 'yellow' | 'red'): EvaluatedAccount {
  const account = { id, name, arr: 100000 } as Account;
  return {
    account,
    evaluation: {
      accountId: id, riskLevel: risk, evaluatedAt: '2026-08-13T12:00:00Z',
      signals: risk === 'red'
        ? [{ type: 'adoption_gap', polarity: 'risk', severity: 'warning', headline: 'Low adoption', detail: '', evidence: {} }]
        : [],
    },
  };
}

const book: EvaluatedAccount[] = [
  evAccount('a1', 'Alpha', 'red'),
  evAccount('a2', 'Beta', 'green'),
];

describe('parseAnswer', () => {
  it('parses a JSON object answer', () => {
    expect(parseAnswer('{"text":"hi","accountIds":["a1"]}')).toEqual({ text: 'hi', accountIds: ['a1'] });
  });
  it('tolerates surrounding prose', () => {
    expect(parseAnswer('Sure: {"text":"x","accountIds":[]} done')).toEqual({ text: 'x', accountIds: [] });
  });
  it('falls back to raw text on non-JSON', () => {
    expect(parseAnswer('just text')).toEqual({ text: 'just text', accountIds: [] });
  });
});

describe('ClaudeAnswerEngine', () => {
  it('maps model-chosen account IDs to refs from OUR data (not the model)', async () => {
    const stub = new StubClaudeClient('{"text":"Alpha is at risk.","accountIds":["a1"]}');
    const res = await new ClaudeAnswerEngine(stub).ask('who is at risk?', book);
    expect(res.text).toBe('Alpha is at risk.');
    expect(res.accounts).toHaveLength(1);
    expect(res.accounts[0]!.id).toBe('a1');
    expect(res.accounts[0]!.riskLevel).toBe('red'); // from our data
  });

  it('drops account IDs the model invents', async () => {
    const stub = new StubClaudeClient('{"text":"x","accountIds":["a1","ghost"]}');
    const res = await new ClaudeAnswerEngine(stub).ask('q', book);
    expect(res.accounts.map((a) => a.id)).toEqual(['a1']); // "ghost" dropped
  });

  it('handles an empty question without calling the model', async () => {
    const res = await new ClaudeAnswerEngine(new StubClaudeClient('unused')).ask('   ', book);
    expect(res.kind).toBe('unknown');
  });

  it('degrades gracefully when the model is down', async () => {
    const res = await new ClaudeAnswerEngine(new FailingClaudeClient()).ask('who is at risk?', book);
    expect(res.accounts).toEqual([]);
    expect(res.text).toMatch(/unavailable/i);
  });
});
