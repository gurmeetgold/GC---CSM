import { describe, it, expect } from 'vitest';
import { renewalRisk } from './renewalRisk';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { Signal } from '../../domain';
import { makeAccount, daysAhead, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // withinDays = 60

const someRisk: Signal = {
  type: 'adoption_gap',
  polarity: 'risk',
  severity: 'warning',
  headline: 'adoption low',
  detail: '',
  evidence: {},
};

describe('renewalRisk', () => {
  it('fires when renewal is near AND another risk is present', () => {
    const s = renewalRisk(makeAccount({ renewalDate: daysAhead(30) }), [someRisk], T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('renewal_risk');
    expect(s!.severity).toBe('critical');
    expect(s!.evidence.daysToRenewal).toBe(30);
  });

  it('stays silent when renewal is near but NO other risk fired', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(30) }), [], T, NOW)).toBeNull();
  });

  it('stays silent when a risk exists but renewal is far away', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(200) }), [someRisk], T, NOW)).toBeNull();
  });

  // --- boundary: within 60 days inclusive ---
  it('fires exactly at the window edge (60 days)', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(60) }), [someRisk], T, NOW)).not.toBeNull();
  });

  it('is silent just outside the window (61 days)', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(61) }), [someRisk], T, NOW)).toBeNull();
  });

  it('fires on the day of renewal (0 days)', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(0) }), [someRisk], T, NOW)).not.toBeNull();
  });

  it('stays silent when renewal is already in the past', () => {
    expect(renewalRisk(makeAccount({ renewalDate: daysAhead(-5) }), [someRisk], T, NOW)).toBeNull();
  });

  it('lists the concurrent drivers in its evidence', () => {
    const s = renewalRisk(makeAccount({ renewalDate: daysAhead(20) }), [someRisk], T, NOW);
    expect(s!.evidence.drivers).toContain('adoption_gap');
    expect(s!.evidence.concurrentRiskCount).toBe(1);
  });
});

// --- Phase 3: jeopardy-tiered severity ---
describe('renewalRisk severity tiers', () => {
  const secondRisk: Signal = { type: 'champion_silence', polarity: 'risk', severity: 'warning', headline: '', detail: '', evidence: {} };

  it('is only a WARNING for a far-off, low-ARR, single-risk renewal', () => {
    const acct = makeAccount({ renewalDate: daysAhead(45), arr: 100_000 });
    expect(renewalRisk(acct, [someRisk], T, NOW)!.severity).toBe('warning');
  });

  it('is CRITICAL when renewal is imminent (≤30 days)', () => {
    const acct = makeAccount({ renewalDate: daysAhead(25), arr: 100_000 });
    expect(renewalRisk(acct, [someRisk], T, NOW)!.severity).toBe('critical');
  });

  it('is CRITICAL for a high-ARR renewal even if far-off', () => {
    const acct = makeAccount({ renewalDate: daysAhead(55), arr: 300_000 });
    expect(renewalRisk(acct, [someRisk], T, NOW)!.severity).toBe('critical');
  });

  it('is CRITICAL when multiple other risks are stacking', () => {
    const acct = makeAccount({ renewalDate: daysAhead(55), arr: 100_000 });
    expect(renewalRisk(acct, [someRisk, secondRisk], T, NOW)!.severity).toBe('critical');
  });

  it('exposes a jeopardy score for sorting the leadership view', () => {
    const near = renewalRisk(makeAccount({ renewalDate: daysAhead(5), arr: 300_000 }), [someRisk, secondRisk], T, NOW);
    const far = renewalRisk(makeAccount({ renewalDate: daysAhead(58), arr: 50_000 }), [someRisk], T, NOW);
    expect(Number(near!.evidence.jeopardyScore)).toBeGreaterThan(Number(far!.evidence.jeopardyScore));
  });
});
