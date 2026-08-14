import { describe, it, expect } from 'vitest';
import { featureDepth } from './featureDepth';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { FeatureUsage } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // window 60d, minPriorUses 5, abandonedMaxUses 0

// prior window = [60,120) days ago; recent = [0,60].
function feature(key: string, isKey: boolean, prior: number, recent: number): FeatureUsage {
  return {
    key,
    label: key,
    isKeyFeature: isKey,
    history: [
      { asOf: daysAgo(90), uses: prior },
      { asOf: daysAgo(20), uses: recent },
    ],
  };
}

describe('featureDepth', () => {
  it('fires when a key feature is abandoned (prior use, now zero)', () => {
    const s = featureDepth(makeAccount({ featureUsage: [feature('Reports', true, 40, 0)] }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('feature_depth');
    expect(s!.evidence.feature).toBe('Reports');
    expect(s!.evidence.priorUses).toBe(40);
  });

  it('stays silent when the key feature is still used', () => {
    expect(featureDepth(makeAccount({ featureUsage: [feature('Reports', true, 40, 30)] }), T, NOW)).toBeNull();
  });

  it('ignores non-key features being abandoned', () => {
    expect(featureDepth(makeAccount({ featureUsage: [feature('Theme', false, 40, 0)] }), T, NOW)).toBeNull();
  });

  // boundaries around minPriorUses (5) and abandonedMaxUses (0)
  it('is silent when prior use is below the minimum (4)', () => {
    expect(featureDepth(makeAccount({ featureUsage: [feature('Reports', true, 4, 0)] }), T, NOW)).toBeNull();
  });

  it('fires exactly at the minimum prior use (5) with recent zero', () => {
    expect(featureDepth(makeAccount({ featureUsage: [feature('Reports', true, 5, 0)] }), T, NOW)).not.toBeNull();
  });

  it('is silent when recent use is just above the abandoned cap (1)', () => {
    expect(featureDepth(makeAccount({ featureUsage: [feature('Reports', true, 40, 1)] }), T, NOW)).toBeNull();
  });

  it('reports the most-used abandoned feature when several qualify', () => {
    const acct = makeAccount({
      featureUsage: [feature('Minor', true, 6, 0), feature('Major', true, 50, 0)],
    });
    expect(featureDepth(acct, T, NOW)!.evidence.feature).toBe('Major');
  });

  it('abstains on cold-start and with no feature data', () => {
    const cold = makeAccount({ featureUsage: [feature('Reports', true, 40, 0)], createdAt: daysAgo(10) });
    expect(featureDepth(cold, T, NOW)).toBeNull();
    expect(featureDepth(makeAccount({ featureUsage: [] }), T, NOW)).toBeNull();
  });
});
