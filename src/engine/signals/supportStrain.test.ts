import { describe, it, expect } from 'vitest';
import { supportStrain } from './supportStrain';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // maxOpenTickets = 8, maxCriticalTickets = 1

describe('supportStrain', () => {
  it('fires (warning) when open-ticket volume exceeds the cap', () => {
    const s = supportStrain(makeAccount({ openTickets: 9, criticalTickets: 0 }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.severity).toBe('warning');
  });

  it('fires (critical) when critical tickets exceed the cap', () => {
    const s = supportStrain(makeAccount({ openTickets: 2, criticalTickets: 2 }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.severity).toBe('critical');
  });

  it('critical severity wins even if volume is fine', () => {
    const s = supportStrain(makeAccount({ openTickets: 1, criticalTickets: 3 }), T, NOW);
    expect(s!.severity).toBe('critical');
  });

  it('stays silent under both caps', () => {
    expect(supportStrain(makeAccount({ openTickets: 3, criticalTickets: 0 }), T, NOW)).toBeNull();
  });

  // --- boundaries: fire only when strictly greater than the cap ---
  it('is silent exactly at the open-ticket cap (8)', () => {
    expect(supportStrain(makeAccount({ openTickets: 8, criticalTickets: 0 }), T, NOW)).toBeNull();
  });

  it('fires just above the open-ticket cap (9)', () => {
    expect(supportStrain(makeAccount({ openTickets: 9, criticalTickets: 0 }), T, NOW)).not.toBeNull();
  });

  it('is silent exactly at the critical cap (1)', () => {
    expect(supportStrain(makeAccount({ openTickets: 0, criticalTickets: 1 }), T, NOW)).toBeNull();
  });

  it('fires just above the critical cap (2)', () => {
    const s = supportStrain(makeAccount({ openTickets: 0, criticalTickets: 2 }), T, NOW);
    expect(s!.severity).toBe('critical');
  });

  it('honors overridden caps', () => {
    const strict = { ...T, supportStrain: { maxOpenTickets: 2, maxCriticalTickets: 0 } };
    expect(supportStrain(makeAccount({ openTickets: 3, criticalTickets: 0 }), strict, NOW)).not.toBeNull();
    expect(supportStrain(makeAccount({ openTickets: 0, criticalTickets: 1 }), strict, NOW)!.severity).toBe('critical');
  });
});
