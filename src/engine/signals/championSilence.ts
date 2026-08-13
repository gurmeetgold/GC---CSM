import type { Signal } from '../../domain';
import { daysSince } from '../time';
import { isColdStart, type SignalFn } from './types';

/**
 * Champion silence: too many days since we last spoke with the key stakeholder.
 * Uses the MOST RECENTLY contacted champion (a still-warm champion protects the
 * account even if another has gone quiet).
 *
 * Abstains when the account has no champion at all (that's a relationship-mapping
 * gap, surfaced elsewhere — not a silence we can measure) and when a champion
 * exists but has literally never been contacted with no signal to anchor days on…
 * except: a never-contacted champion IS a risk, so we treat null lastContactedAt
 * as maximally silent.
 */
export const championSilence: SignalFn = (account, t, now) => {
  if (isColdStart(account, t, now)) return null;
  const champions = (account.contacts ?? []).filter((c) => c.isChampion);
  if (champions.length === 0) return null;

  // The account is protected by the FRESHEST champion contact, so we decide on the
  // minimum silence across champions. A null contact date ("never contacted") does
  // not count as fresh — only a real contact can protect the account.
  let freshestSilence: number | null = null;
  for (const c of champions) {
    const d = daysSince(c.lastContactedAt, now);
    if (d === null) continue;
    if (freshestSilence === null || d < freshestSilence) freshestSilence = d;
  }

  // Every champion is null-contacted: a genuine risk we can't put a number on.
  if (freshestSilence === null) {
    const signal: Signal = {
      type: 'champion_silence',
      polarity: 'risk',
      severity: 'warning',
      headline: `Champion never contacted`,
      detail: `No recorded contact with the account champion. Establish a relationship touchpoint.`,
      evidence: {
        daysSinceContact: 'never',
        thresholdDays: t.championSilence.maxDaysSinceContact,
      },
    };
    return signal;
  }

  // Fire only if even the freshest champion contact exceeds the threshold.
  if (freshestSilence <= t.championSilence.maxDaysSinceContact) return null;

  const signal: Signal = {
    type: 'champion_silence',
    polarity: 'risk',
    severity: 'warning',
    headline: `${freshestSilence} days since champion contact`,
    detail: `It has been ${freshestSilence} days since the last touchpoint with the account champion, past the ${t.championSilence.maxDaysSinceContact}-day threshold.`,
    evidence: {
      daysSinceContact: freshestSilence,
      thresholdDays: t.championSilence.maxDaysSinceContact,
    },
  };
  return signal;
};
