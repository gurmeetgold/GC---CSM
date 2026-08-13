import { describe, it, expect } from 'vitest';
import { MOCK_ACCOUNTS } from './accounts';
import { REFERENCE_NOW } from './referenceTime';
import { evaluate } from '../../engine';
import { DEFAULT_THRESHOLDS, type RiskLevel, type SignalType } from '../../domain';

/**
 * Table-driven contract test over the whole mock book. Each account's expected
 * RiskLevel (and, where it matters, the specific signals that should fire) is
 * asserted against the engine. If a threshold or signal changes and the mock
 * drifts, this test fails loudly — the mock can never silently go stale.
 */

interface Case {
  id: string;
  expected: RiskLevel;
  mustFire?: SignalType[];
  mustNotFire?: SignalType[];
}

const CASES: Case[] = [
  // greens
  { id: 'northwind', expected: 'green' },
  { id: 'contoso', expected: 'green' },
  { id: 'fabrikam', expected: 'green' },
  { id: 'tailspin', expected: 'green' },
  { id: 'schooloffine', expected: 'green' },
  { id: 'worldwide', expected: 'green' },
  { id: 'wideworld', expected: 'green' },
  // renewal proximity alone must NOT read as risk
  { id: 'humongous', expected: 'green', mustNotFire: ['renewal_risk'] },
  // growth opportunities (green risk + positive signal)
  { id: 'adventureworks', expected: 'green', mustFire: ['growth_opportunity'] },
  { id: 'wingtip', expected: 'green', mustFire: ['growth_opportunity'] },
  { id: 'coho', expected: 'green', mustFire: ['growth_opportunity'] },
  // yellows (single weak signal)
  { id: 'proseware', expected: 'yellow', mustFire: ['adoption_gap'] },
  { id: 'litware', expected: 'yellow', mustFire: ['champion_silence'] },
  { id: 'fourthcoffee', expected: 'yellow', mustFire: ['support_strain'] },
  { id: 'blueyonder', expected: 'yellow', mustFire: ['champion_silence'], mustNotFire: ['usage_decline'] },
  { id: 'fabrikamresidences', expected: 'yellow', mustFire: ['adoption_gap'] },
  // reds
  { id: 'contosopharma', expected: 'red', mustFire: ['usage_decline'] },
  { id: 'graphicdesign', expected: 'red', mustFire: ['adoption_gap', 'champion_silence'] },
  { id: 'vanarsdel', expected: 'red', mustFire: ['adoption_gap', 'renewal_risk'] },
  { id: 'alpineski', expected: 'red', mustFire: ['support_strain'] },
  { id: 'bestforyou', expected: 'red', mustFire: ['usage_decline', 'adoption_gap', 'champion_silence'] },
  { id: 'relecloud', expected: 'red', mustFire: ['champion_silence', 'renewal_risk'] },
  { id: 'margiestravel', expected: 'red', mustFire: ['adoption_gap', 'renewal_risk'] },
  // cold-start (thin data must never read red)
  { id: 'treyresearch', expected: 'green', mustNotFire: ['usage_decline', 'adoption_gap', 'champion_silence'] },
  { id: 'lucerne', expected: 'green', mustNotFire: ['usage_decline', 'adoption_gap'] },
];

function evalById(id: string) {
  const account = MOCK_ACCOUNTS.find((a) => a.id === id);
  if (!account) throw new Error(`mock account not found: ${id}`);
  return evaluate(account, DEFAULT_THRESHOLDS, REFERENCE_NOW);
}

describe('mock book of business', () => {
  it('contains exactly 25 accounts', () => {
    expect(MOCK_ACCOUNTS).toHaveLength(25);
  });

  it('has a test case for every mock account (and vice versa)', () => {
    const caseIds = new Set(CASES.map((c) => c.id));
    const acctIds = new Set(MOCK_ACCOUNTS.map((a) => a.id));
    expect(caseIds).toEqual(acctIds);
  });

  it('exercises all three risk levels', () => {
    const levels = new Set(CASES.map((c) => c.expected));
    expect(levels).toEqual(new Set(['green', 'yellow', 'red']));
  });

  it.each(CASES)('$id → $expected', ({ id, expected, mustFire, mustNotFire }) => {
    const e = evalById(id);
    const fired = new Set(e.signals.map((s) => s.type));
    expect(e.riskLevel, `${id} risk level`).toBe(expected);
    for (const t of mustFire ?? []) {
      expect(fired.has(t), `${id} should fire ${t}`).toBe(true);
    }
    for (const t of mustNotFire ?? []) {
      expect(fired.has(t), `${id} should NOT fire ${t}`).toBe(false);
    }
  });
});
