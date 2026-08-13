import { describe, it, expect } from 'vitest';
import { validateReasoning, ClaudeReasoningWriter, deterministicSummary } from './reasoning';
import { StubClaudeClient, FailingClaudeClient } from './__fixtures__/stubClaude';
import type { Account, Signal } from '../../domain';

const account: Account = {
  id: 'a', name: 'Acme', segment: 'enterprise', arr: 200000, renewalDate: '2026-09-30',
  licensedSeats: 100, activeUsers: 40, usageHistory: [], contacts: [], interactions: [],
  openTickets: 0, criticalTickets: 0, createdAt: '2023-01-01',
};

const adoptionSignal: Signal = {
  type: 'adoption_gap', polarity: 'risk', severity: 'warning',
  headline: 'Only 40% of seats active', detail: '40 of 100 seats active.', evidence: {},
};
const championSignal: Signal = {
  type: 'champion_silence', polarity: 'risk', severity: 'warning',
  headline: '60 days since champion contact', detail: 'No touchpoint in 60 days.', evidence: {},
};

describe('validateReasoning (faithfulness guard)', () => {
  const fired = [adoptionSignal.type, championSignal.type];

  it('accepts narration that references only fired signals', () => {
    const text = 'Acme is at risk: only 40% of seats are active and it has been 60 days since champion contact.';
    const res = validateReasoning(text, fired);
    expect(res.faithful).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it('flags narration that invents an unfired risk (hallucinated usage decline)', () => {
    const text = 'Acme shows an adoption gap AND a sharp usage decline over the last quarter.';
    const res = validateReasoning(text, fired);
    expect(res.faithful).toBe(false);
    expect(res.violations).toContain('usage_decline');
  });

  it('flags a hallucinated renewal risk', () => {
    const text = 'The account has low adoption and is up for renewal imminently.';
    const res = validateReasoning(text, fired);
    expect(res.violations).toContain('renewal_risk');
  });
});

describe('ClaudeReasoningWriter', () => {
  const fired = [adoptionSignal, championSignal];

  it('uses the model output when it is faithful', async () => {
    const stub = new StubClaudeClient('Acme is flagged: only 40% of seats are active and 60 days since champion contact.');
    const res = await new ClaudeReasoningWriter(stub).write(account, fired);
    expect(res.fromModel).toBe(true);
    expect(res.text).toMatch(/40%/);
  });

  it('REJECTS hallucinated model output and falls back to a faithful summary', async () => {
    const stub = new StubClaudeClient('Acme has an adoption gap and a major usage decline and support escalations.');
    const res = await new ClaudeReasoningWriter(stub).write(account, fired);
    expect(res.fromModel).toBe(false); // hallucination caught
    // Fallback references only the fired signals.
    expect(validateReasoning(res.text, fired.map((s) => s.type)).faithful).toBe(true);
  });

  it('falls back to the deterministic summary when the model is down', async () => {
    const res = await new ClaudeReasoningWriter(new FailingClaudeClient()).write(account, fired);
    expect(res.fromModel).toBe(false);
    expect(res.text).toContain('Acme');
  });

  it('deterministicSummary is always faithful by construction', () => {
    const text = deterministicSummary(account, fired);
    expect(validateReasoning(text, fired.map((s) => s.type)).faithful).toBe(true);
  });
});
