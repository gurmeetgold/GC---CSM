import { type SignalFn } from './types';

/**
 * Contract/billing friction: an overdue or disputed invoice, or explicit pricing
 * pushback. A commercial-relationship risk that pure product usage never surfaces.
 *
 * Escalates to critical when BOTH an overdue and a disputed invoice are present
 * (money is stuck and contested at once); otherwise a warning. Abstains when no
 * flag is set.
 */
export const billingFriction: SignalFn = (account) => {
  const flags = account.billingFlags;
  if (!flags) return null;
  const { overdueInvoice, disputedInvoice, pricingPushback } = flags;
  if (!overdueInvoice && !disputedInvoice && !pricingPushback) return null;

  const reasons: string[] = [];
  if (overdueInvoice) reasons.push('an overdue invoice');
  if (disputedInvoice) reasons.push('a disputed invoice');
  if (pricingPushback) reasons.push('pricing pushback');

  const severe = overdueInvoice && disputedInvoice;

  return {
    type: 'billing_friction',
    polarity: 'risk',
    severity: severe ? 'critical' : 'warning',
    headline: severe ? 'Billing dispute + overdue invoice' : 'Billing friction',
    detail: `Commercial friction on the account: ${joinList(reasons)}.`,
    evidence: {
      overdueInvoice: String(overdueInvoice),
      disputedInvoice: String(disputedInvoice),
      pricingPushback: String(pricingPushback),
    },
  };
};

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
