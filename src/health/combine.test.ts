import { describe, it, expect } from 'vitest';
import { combineEvaluation } from './combine';
import { evaluate } from '../engine';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { Account, Signal } from '../domain';

const NOW = new Date('2026-08-13T12:00:00.000Z');

// A healthy account (green) so we can observe soft signals moving the needle.
const healthy: Account = {
  id: 'a', name: 'Acct', segment: 'mid_market', arr: 100000, renewalDate: '2027-06-01',
  licensedSeats: 100, activeUsers: 75, usageHistory: [
    { asOf: '2026-04-15', activeUsers: 74 }, { asOf: '2026-05-15', activeUsers: 75 },
  ],
  contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: '2026-08-05' }],
  interactions: [], openTickets: 1, criticalTickets: 0, createdAt: '2023-01-01',
  responsiveness: [], featureUsage: [], activatedAt: '2023-02-01',
  billingFlags: { overdueInvoice: false, disputedInvoice: false, pricingPushback: false },
  ownerCsm: 'CSM', priorArr: 100000, lifecycleState: 'active',
};

function softWarning(): Signal {
  return { type: 'sentiment_decline', polarity: 'risk', severity: 'warning', headline: 'Sentiment down', detail: '', evidence: {} };
}

describe('combineEvaluation (soft signals via the frozen roll-up)', () => {
  it('returns the base evaluation unchanged when there are no soft signals', () => {
    const base = evaluate(healthy, DEFAULT_THRESHOLDS, NOW);
    const combined = combineEvaluation(base, []);
    expect(combined).toBe(base);
  });

  it('a single soft warning takes a green account to yellow', () => {
    const base = evaluate(healthy, DEFAULT_THRESHOLDS, NOW);
    expect(base.riskLevel).toBe('green');
    const combined = combineEvaluation(base, [softWarning()]);
    expect(combined.riskLevel).toBe('yellow');
    expect(combined.signals.some((s) => s.source === 'soft')).toBe(true);
  });

  it('two soft warnings stack to red (uniform with hard-signal rules)', () => {
    const base = evaluate(healthy, DEFAULT_THRESHOLDS, NOW);
    const combined = combineEvaluation(base, [softWarning(), { ...softWarning(), type: 'competitor_mention' }]);
    expect(combined.riskLevel).toBe('red');
  });

  it('a soft warning stacks with an existing hard warning to reach red', () => {
    // Exactly one hard warning (adoption gap) and flat usage so nothing else fires.
    const oneWarning: Account = {
      ...healthy,
      activeUsers: 40,
      usageHistory: [
        { asOf: '2026-04-15', activeUsers: 41 },
        { asOf: '2026-05-15', activeUsers: 40 },
      ],
    };
    const base = evaluate(oneWarning, DEFAULT_THRESHOLDS, NOW);
    expect(base.riskLevel).toBe('yellow');
    const combined = combineEvaluation(base, [softWarning()]);
    expect(combined.riskLevel).toBe('red');
  });

  it('stamps every merged soft signal with source=soft', () => {
    const base = evaluate(healthy, DEFAULT_THRESHOLDS, NOW);
    const combined = combineEvaluation(base, [{ ...softWarning(), source: undefined as never }]);
    const soft = combined.signals.filter((s) => s.type === 'sentiment_decline');
    expect(soft.every((s) => s.source === 'soft')).toBe(true);
  });
});
