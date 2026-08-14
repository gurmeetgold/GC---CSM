import { describe, it, expect } from 'vitest';
import { emailResponsiveness } from './emailResponsiveness';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // window 60d, maxMedianReplyHours 72, minReplyRatePct 50

function withResponsiveness(medianReplyHours: number, replyRatePct: number, ageDays = 5) {
  return makeAccount({ responsiveness: [{ asOf: daysAgo(ageDays), medianReplyHours, replyRatePct }] });
}

describe('emailResponsiveness', () => {
  it('fires when reply latency exceeds the cap', () => {
    const s = emailResponsiveness(withResponsiveness(96, 80), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('email_responsiveness');
    expect(s!.evidence.medianReplyHours).toBe(96);
  });

  it('fires when the reply rate drops below the floor', () => {
    expect(emailResponsiveness(withResponsiveness(24, 30), T, NOW)).not.toBeNull();
  });

  it('stays silent when responsive and answering', () => {
    expect(emailResponsiveness(withResponsiveness(24, 80), T, NOW)).toBeNull();
  });

  // boundaries: fires only when strictly over the cap / strictly under the floor
  it('is silent exactly at the latency cap (72h) and rate floor (50%)', () => {
    expect(emailResponsiveness(withResponsiveness(72, 50), T, NOW)).toBeNull();
  });

  it('fires just over the latency cap (73h)', () => {
    expect(emailResponsiveness(withResponsiveness(73, 80), T, NOW)).not.toBeNull();
  });

  it('fires just under the rate floor (49%)', () => {
    expect(emailResponsiveness(withResponsiveness(24, 49), T, NOW)).not.toBeNull();
  });

  it('uses the latest snapshot within the window', () => {
    const acct = makeAccount({
      responsiveness: [
        { asOf: daysAgo(50), medianReplyHours: 12, replyRatePct: 90 }, // older, healthy
        { asOf: daysAgo(5), medianReplyHours: 120, replyRatePct: 20 }, // latest, bad
      ],
    });
    expect(emailResponsiveness(acct, T, NOW)).not.toBeNull();
  });

  it('ignores snapshots older than the window', () => {
    const acct = makeAccount({ responsiveness: [{ asOf: daysAgo(120), medianReplyHours: 200, replyRatePct: 5 }] });
    expect(emailResponsiveness(acct, T, NOW)).toBeNull();
  });

  it('abstains when there is no responsiveness data', () => {
    expect(emailResponsiveness(makeAccount({ responsiveness: [] }), T, NOW)).toBeNull();
  });
});
