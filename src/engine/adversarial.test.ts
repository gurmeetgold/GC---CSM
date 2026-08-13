import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { Account } from '../domain';
import { NOW } from '../test/factory';

const T = DEFAULT_THRESHOLDS;

/**
 * Adversarial pass: the engine must never throw on malformed input. These feed it
 * empties, nulls, missing fields, and absurd values through a deliberately loose
 * cast (real data-source drift can produce any of these) and assert only that it
 * degrades to a sane evaluation.
 */
describe('engine adversarial robustness', () => {
  it('survives a nearly-empty account', () => {
    const bare = {
      id: 'bare',
      name: '',
      segment: 'smb',
      arr: 0,
      renewalDate: '',
      licensedSeats: 0,
      activeUsers: 0,
      usageHistory: [],
      contacts: [],
      interactions: [],
      openTickets: 0,
      criticalTickets: 0,
      createdAt: '',
    } as Account;
    expect(() => evaluate(bare, T, NOW)).not.toThrow();
    const e = evaluate(bare, T, NOW);
    expect(['green', 'yellow', 'red']).toContain(e.riskLevel);
  });

  it('survives null/undefined-riddled fields', () => {
    const broken = {
      id: 'broken',
      usageHistory: null,
      contacts: null,
      interactions: undefined,
      licensedSeats: null,
      activeUsers: undefined,
      renewalDate: null,
      createdAt: null,
      openTickets: undefined,
      criticalTickets: null,
    } as unknown as Account;
    expect(() => evaluate(broken, T, NOW)).not.toThrow();
  });

  it('survives unparseable dates', () => {
    const acct = {
      id: 'baddates',
      name: 'Bad Dates',
      segment: 'smb',
      arr: 1000,
      renewalDate: 'not-a-date',
      licensedSeats: 10,
      activeUsers: 5,
      usageHistory: [{ asOf: 'nope', activeUsers: 10 }],
      contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: 'garbage' }],
      interactions: [],
      openTickets: 1,
      criticalTickets: 0,
      createdAt: 'whenever',
    } as unknown as Account;
    expect(() => evaluate(acct, T, NOW)).not.toThrow();
  });

  it('survives absurd numeric values without producing NaN risk', () => {
    const absurd = {
      id: 'absurd',
      name: 'Absurd',
      segment: 'enterprise',
      arr: Number.MAX_SAFE_INTEGER,
      renewalDate: NOW.toISOString(),
      licensedSeats: -50,
      activeUsers: 9_999_999,
      usageHistory: [
        { asOf: '2020-01-01', activeUsers: -100 },
        { asOf: '2021-01-01', activeUsers: Infinity as unknown as number },
      ],
      contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: '1990-01-01' }],
      interactions: [],
      openTickets: 1e9,
      criticalTickets: 1e9,
      createdAt: '2000-01-01',
    } as unknown as Account;
    expect(() => evaluate(absurd, T, NOW)).not.toThrow();
    const e = evaluate(absurd, T, NOW);
    expect(['green', 'yellow', 'red']).toContain(e.riskLevel);
  });

  it('handles an account where every signal fires at once', () => {
    const everything = {
      id: 'everything',
      name: 'Everything Wrong',
      segment: 'enterprise',
      arr: 500_000,
      renewalDate: new Date(NOW.getTime() + 10 * 86_400_000).toISOString(), // near renewal
      licensedSeats: 100,
      activeUsers: 10, // adoption gap + huge usage decline
      usageHistory: [
        { asOf: new Date(NOW.getTime() - 120 * 86_400_000).toISOString(), activeUsers: 95 },
        { asOf: new Date(NOW.getTime() - 90 * 86_400_000).toISOString(), activeUsers: 90 },
        { asOf: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(), activeUsers: 10 },
      ],
      contacts: [{ id: 'c', name: 'C', title: 'VP', isChampion: true, lastContactedAt: new Date(NOW.getTime() - 200 * 86_400_000).toISOString() }],
      interactions: [],
      openTickets: 50,
      criticalTickets: 10,
      createdAt: '2020-01-01',
    } as Account;
    const e = evaluate(everything, T, NOW);
    expect(e.riskLevel).toBe('red');
    // usage_decline, adoption_gap, champion_silence, support_strain, renewal_risk
    const riskTypes = new Set(e.signals.filter((s) => s.polarity === 'risk').map((s) => s.type));
    expect(riskTypes.has('usage_decline')).toBe(true);
    expect(riskTypes.has('adoption_gap')).toBe(true);
    expect(riskTypes.has('champion_silence')).toBe(true);
    expect(riskTypes.has('support_strain')).toBe(true);
    expect(riskTypes.has('renewal_risk')).toBe(true);
  });
});
