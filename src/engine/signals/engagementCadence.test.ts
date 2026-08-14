import { describe, it, expect } from 'vitest';
import { engagementCadence } from './engagementCadence';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { Interaction } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // recent 60d, prior 60d, minPrior 2, dropPct 50

let n = 0;
function touch(daysAgoN: number, kind: Interaction['kind'] = 'call'): Interaction {
  return { id: `i${n++}`, occurredAt: daysAgo(daysAgoN), kind, summary: 's' };
}
// prior window = [60,120) days ago; recent window = [0,60] days ago.
function withTouchpoints(prior: number[], recent: number[]) {
  return makeAccount({ interactions: [...prior.map((d) => touch(d)), ...recent.map((d) => touch(d))] });
}

describe('engagementCadence', () => {
  it('fires when cadence drops sharply vs the prior baseline', () => {
    const s = engagementCadence(withTouchpoints([70, 80, 90, 100], [10]), T, NOW); // 4 → 1 = 75%
    expect(s).not.toBeNull();
    expect(s!.type).toBe('engagement_cadence');
    expect(s!.evidence.priorTouchpoints).toBe(4);
    expect(s!.evidence.recentTouchpoints).toBe(1);
  });

  it('counts meetings as well as calls', () => {
    const acct = makeAccount({
      interactions: [touch(70, 'meeting'), touch(90, 'meeting'), touch(100, 'call'), touch(10, 'meeting')],
    });
    expect(engagementCadence(acct, T, NOW)).not.toBeNull(); // 3 → 1
  });

  it('ignores email/support interactions (not live touchpoints)', () => {
    const acct = makeAccount({
      interactions: [touch(70), touch(90), touch(20, 'email'), touch(10, 'support')],
    });
    // prior calls = 2, recent live touchpoints = 0 → 100% drop → fires
    expect(engagementCadence(acct, T, NOW)).not.toBeNull();
  });

  it('stays silent when cadence holds steady', () => {
    expect(engagementCadence(withTouchpoints([70, 90], [10, 30]), T, NOW)).toBeNull(); // 2 → 2
  });

  // boundary: fires at exactly dropPct (50%)
  it('fires exactly at the drop threshold (50%)', () => {
    expect(engagementCadence(withTouchpoints([70, 80, 90, 100], [10, 30]), T, NOW)).not.toBeNull(); // 4 → 2 = 50%
  });

  it('is silent just below the threshold (25% drop)', () => {
    expect(engagementCadence(withTouchpoints([70, 80, 90, 100], [10, 20, 30]), T, NOW)).toBeNull(); // 4 → 3
  });

  it('abstains when the prior baseline is too thin', () => {
    expect(engagementCadence(withTouchpoints([70], []), T, NOW)).toBeNull(); // only 1 prior
  });

  it('abstains on cold-start', () => {
    const a = withTouchpoints([70, 90], [10]);
    a.createdAt = daysAgo(10);
    expect(engagementCadence(a, T, NOW)).toBeNull();
  });

  it('abstains with no interactions', () => {
    expect(engagementCadence(makeAccount({ interactions: [] }), T, NOW)).toBeNull();
  });
});
