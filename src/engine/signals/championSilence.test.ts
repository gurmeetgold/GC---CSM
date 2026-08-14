import { describe, it, expect } from 'vitest';
import { championSilence } from './championSilence';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { Contact } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // maxDaysSinceContact = 45

function champ(lastContactedDays: number | null): Contact {
  return {
    id: 'c1',
    name: 'Champ',
    title: 'VP',
    isChampion: true,
    lastContactedAt: lastContactedDays === null ? null : daysAgo(lastContactedDays),
    engagement: 'medium',
  };
}

describe('championSilence', () => {
  it('fires when silence exceeds the threshold', () => {
    const s = championSilence(makeAccount({ contacts: [champ(60)] }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('champion_silence');
    expect(s!.evidence.daysSinceContact).toBe(60);
  });

  it('stays silent when contact is recent', () => {
    expect(championSilence(makeAccount({ contacts: [champ(10)] }), T, NOW)).toBeNull();
  });

  // --- boundary: threshold 45, fires only when strictly greater ---
  it('is silent exactly at the threshold (45 days)', () => {
    expect(championSilence(makeAccount({ contacts: [champ(45)] }), T, NOW)).toBeNull();
  });

  it('fires just past the threshold (46 days)', () => {
    expect(championSilence(makeAccount({ contacts: [champ(46)] }), T, NOW)).not.toBeNull();
  });

  it('is silent just under the threshold (44 days)', () => {
    expect(championSilence(makeAccount({ contacts: [champ(44)] }), T, NOW)).toBeNull();
  });

  // --- multiple champions: freshest contact protects the account ---
  it('uses the most recently contacted champion', () => {
    const acct = makeAccount({ contacts: [champ(90), champ(10)] });
    expect(championSilence(acct, T, NOW)).toBeNull(); // one champion is still warm
  });

  it('fires when every champion is stale, reporting the freshest silence', () => {
    const acct = makeAccount({ contacts: [champ(90), champ(60)] });
    const s = championSilence(acct, T, NOW);
    expect(s).not.toBeNull();
    expect(s!.evidence.daysSinceContact).toBe(60); // freshest contact still exceeds the bar
  });

  // --- never contacted ---
  it('fires as "never contacted" when champion has no contact date', () => {
    const s = championSilence(makeAccount({ contacts: [champ(null)] }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.evidence.daysSinceContact).toBe('never');
  });

  // --- abstention cases ---
  it('abstains when there is no champion', () => {
    const nonChamp: Contact = { id: 'x', name: 'User', title: 'Analyst', isChampion: false, lastContactedAt: daysAgo(200), engagement: 'low' };
    expect(championSilence(makeAccount({ contacts: [nonChamp] }), T, NOW)).toBeNull();
  });

  it('abstains on cold-start', () => {
    const a = makeAccount({ contacts: [champ(null)], createdAt: daysAgo(10) });
    expect(championSilence(a, T, NOW)).toBeNull();
  });
});
