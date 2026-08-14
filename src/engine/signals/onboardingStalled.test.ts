import { describe, it, expect } from 'vitest';
import { onboardingStalled } from './onboardingStalled';
import { DEFAULT_THRESHOLDS } from '../../domain';
import { makeAccount, daysAgo, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS; // targetActivationDays 45, staleUntilDays 365

function notActivated(ageDays: number) {
  return makeAccount({ activatedAt: null, createdAt: daysAgo(ageDays) });
}

describe('onboardingStalled', () => {
  it('fires for a not-yet-activated account past the activation window', () => {
    const s = onboardingStalled(notActivated(60), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('onboarding_stalled');
    expect(s!.evidence.ageDays).toBe(60);
  });

  it('stays silent once the account has activated', () => {
    const a = makeAccount({ activatedAt: daysAgo(50), createdAt: daysAgo(60) });
    expect(onboardingStalled(a, T, NOW)).toBeNull();
  });

  it('stays silent for a brand-new account still inside the ramp window', () => {
    expect(onboardingStalled(notActivated(20), T, NOW)).toBeNull();
  });

  // boundaries
  it('is silent exactly at the activation target (45 days)', () => {
    expect(onboardingStalled(notActivated(45), T, NOW)).toBeNull();
  });

  it('fires just past the activation target (46 days)', () => {
    expect(onboardingStalled(notActivated(46), T, NOW)).not.toBeNull();
  });

  it('fires exactly at the stale horizon (365 days)', () => {
    expect(onboardingStalled(notActivated(365), T, NOW)).not.toBeNull();
  });

  it('is silent beyond the horizon — chronic, not stalled onboarding (366 days)', () => {
    expect(onboardingStalled(notActivated(366), T, NOW)).toBeNull();
  });

  it('abstains when the creation date is unknown', () => {
    expect(onboardingStalled(makeAccount({ activatedAt: null, createdAt: '' }), T, NOW)).toBeNull();
  });
});
