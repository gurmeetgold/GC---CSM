import { describe, it, expect } from 'vitest';
import { billingFriction } from './billingFriction';
import { DEFAULT_THRESHOLDS } from '../../domain';
import type { BillingFlags } from '../../domain';
import { makeAccount, NOW } from '../../test/factory';

const T = DEFAULT_THRESHOLDS;

function flags(f: Partial<BillingFlags>) {
  return makeAccount({
    billingFlags: { overdueInvoice: false, disputedInvoice: false, pricingPushback: false, ...f },
  });
}

describe('billingFriction', () => {
  it('stays silent when no flags are set', () => {
    expect(billingFriction(flags({}), T, NOW)).toBeNull();
  });

  it('fires (warning) on a single flag', () => {
    const s = billingFriction(flags({ pricingPushback: true }), T, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe('billing_friction');
    expect(s!.severity).toBe('warning');
  });

  it('fires (warning) on an overdue invoice alone', () => {
    expect(billingFriction(flags({ overdueInvoice: true }), T, NOW)!.severity).toBe('warning');
  });

  it('escalates to critical when overdue AND disputed', () => {
    const s = billingFriction(flags({ overdueInvoice: true, disputedInvoice: true }), T, NOW);
    expect(s!.severity).toBe('critical');
  });

  it('records which flags tripped in its evidence', () => {
    const s = billingFriction(flags({ disputedInvoice: true, pricingPushback: true }), T, NOW);
    expect(s!.evidence.disputedInvoice).toBe('true');
    expect(s!.evidence.pricingPushback).toBe('true');
    expect(s!.evidence.overdueInvoice).toBe('false');
  });
});
