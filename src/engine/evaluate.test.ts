import { describe, it, expect } from 'vitest';
import { evaluate, rollUp } from './evaluate';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { Signal } from '../domain';
import { makeAccount, daysAgo, daysAhead, NOW } from '../test/factory';

const T = DEFAULT_THRESHOLDS;

function risk(severity: Signal['severity']): Signal {
  return { type: 'adoption_gap', polarity: 'risk', severity, headline: '', detail: '', evidence: {} };
}
function renewal(severity: Signal['severity']): Signal {
  return { type: 'renewal_risk', polarity: 'risk', severity, headline: '', detail: '', evidence: {} };
}
const opportunity: Signal = {
  type: 'growth_opportunity', polarity: 'opportunity', severity: 'info', headline: '', detail: '', evidence: {},
};

describe('rollUp', () => {
  it('green when no risk signals fired', () => {
    expect(rollUp([])).toBe('green');
    expect(rollUp([opportunity])).toBe('green'); // opportunity never worsens risk
  });

  it('yellow for a single warning', () => {
    expect(rollUp([risk('warning')])).toBe('yellow');
  });

  it('red for two or more stacked warnings', () => {
    expect(rollUp([risk('warning'), risk('warning')])).toBe('red');
  });

  it('red for any critical risk', () => {
    expect(rollUp([risk('critical')])).toBe('red');
  });

  it('opportunity signals do not push an otherwise-healthy account off green', () => {
    expect(rollUp([opportunity, opportunity])).toBe('green');
  });

  // --- Phase 3: renewal is an amplifier, not a stacking driver ---
  it('a single warning driver under a low-jeopardy (warning) renewal stays YELLOW', () => {
    expect(rollUp([risk('warning'), renewal('warning')])).toBe('yellow');
  });

  it('a critical-tier renewal amplifies a single warning driver to RED', () => {
    expect(rollUp([risk('warning'), renewal('critical')])).toBe('red');
  });

  it('does not count the renewal warning as a second stacking driver', () => {
    // one real driver + renewal warning must NOT behave like two warnings.
    expect(rollUp([risk('warning'), renewal('warning')])).not.toBe('red');
  });

  it('two real warning drivers are still red regardless of renewal tier', () => {
    expect(rollUp([risk('warning'), risk('warning'), renewal('warning')])).toBe('red');
  });
});

describe('evaluate (integration of registry + roll-up)', () => {
  it('a healthy account is green with no risk signals', () => {
    const e = evaluate(makeAccount(), T, NOW);
    expect(e.riskLevel).toBe('green');
    expect(e.signals.filter((s) => s.polarity === 'risk')).toHaveLength(0);
  });

  it('renewal proximity ALONE (no other risk) does not read as risk', () => {
    const e = evaluate(makeAccount({ renewalDate: daysAhead(20) }), T, NOW);
    expect(e.riskLevel).toBe('green');
    expect(e.signals.some((s) => s.type === 'renewal_risk')).toBe(false);
  });

  it('renewal proximity + an adoption gap escalates to red via renewal_risk', () => {
    const e = evaluate(makeAccount({ renewalDate: daysAhead(20), activeUsers: 30 }), T, NOW);
    expect(e.riskLevel).toBe('red');
    expect(e.signals.some((s) => s.type === 'renewal_risk')).toBe(true);
    expect(e.signals.some((s) => s.type === 'adoption_gap')).toBe(true);
  });

  it('stamps evaluatedAt from the injected clock (deterministic)', () => {
    const e = evaluate(makeAccount(), T, NOW);
    expect(e.evaluatedAt).toBe(NOW.toISOString());
  });

  it('a cold-start account with thin data is not painted red', () => {
    const cold = makeAccount({
      createdAt: daysAgo(10),
      usageHistory: [],
      interactions: [],
      activeUsers: 3,
      licensedSeats: 50,
      contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: null }],
    });
    const e = evaluate(cold, T, NOW);
    expect(e.riskLevel).not.toBe('red');
  });
});
