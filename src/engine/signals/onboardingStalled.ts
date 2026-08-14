import { daysSince } from '../time';
import { type SignalFn } from './types';

/**
 * Onboarding stalled: a newer account never reached its activation milestone within
 * the expected window. Fires when the account is NOT activated and its age is past
 * the activation target — but still within the new-account horizon (beyond that,
 * an un-activated account is a different, chronic problem, not a stalled onboarding).
 *
 * Deliberately NOT cold-start-gated: it is specifically about new accounts. It only
 * fires AFTER the activation window, so a brand-new account never trips it.
 */
export const onboardingStalled: SignalFn = (account, t, now) => {
  if (account.activatedAt) return null; // already activated — nothing stalled

  const ageDays = daysSince(account.createdAt, now);
  if (ageDays === null) return null; // unknown age → can't judge

  const cfg = t.onboarding;
  if (ageDays <= cfg.targetActivationDays) return null; // still inside the ramp window
  if (ageDays > cfg.staleUntilDays) return null; // chronic, not "stalled onboarding"

  return {
    type: 'onboarding_stalled',
    polarity: 'risk',
    severity: 'warning',
    headline: `Onboarding stalled — ${ageDays}d, not activated`,
    detail: `The account is ${ageDays} days old and still hasn’t hit its activation milestone (expected within ${cfg.targetActivationDays} days). Momentum is at risk before it ever built.`,
    evidence: {
      ageDays,
      targetActivationDays: cfg.targetActivationDays,
    },
  };
};
