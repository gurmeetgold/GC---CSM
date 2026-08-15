import type {
  Account,
  Contact,
  Interaction,
  LifecycleState,
  Segment,
  UsageSnapshot,
} from '../../domain';
import {
  getBoolField,
  getNumberField,
  getStringField,
  getUsageSeriesField,
} from './customFields';
import { mapTicketsForAccount } from './ticketMappers';
import type {
  GongCall,
  MergeAccount,
  MergeContact,
  MergeOpportunity,
  MergeTicket,
} from './vendorTypes';

/**
 * Pure vendor → domain mappers. No network, no side effects. Fully unit-tested
 * against messy fixtures. This file is the ONLY translation layer: vendor field
 * names enter here and only domain objects leave.
 */

// Candidate custom-field keys, ordered by preference. Covers the common per-org
// naming variants we expect to see across Salesforce instances.
const KEYS = {
  arr: ['arr', 'ARR', 'annual_recurring_revenue', 'Annual_Recurring_Revenue__c', ' acv', 'ACV'],
  renewalDate: ['renewal_date', 'Renewal_Date__c', 'contract_end_date', 'Contract_End_Date__c'],
  licensedSeats: ['licensed_seats', 'Licensed_Seats__c', 'seats', 'Seats__c', 'contracted_seats'],
  activeUsers: ['active_users', 'Active_Users__c', 'mau', 'MAU__c'],
  usageSeries: ['usage_history', 'Usage_History__c', 'usage_trend'],
  segment: ['segment', 'Segment__c', 'tier', 'Tier__c'],
  isChampion: ['is_champion', 'Is_Champion__c', 'champion', 'Champion__c'],
  criticalOpenTickets: ['critical_tickets', 'Critical_Tickets__c'],
  openTickets: ['open_tickets', 'Open_Tickets__c'],
  // Phase 3 fields
  activatedAt: ['activated_at', 'Activated_At__c', 'activation_date', 'Activation_Date__c'],
  overdueInvoice: ['overdue_invoice', 'Overdue_Invoice__c', 'past_due'],
  disputedInvoice: ['disputed_invoice', 'Disputed_Invoice__c', 'invoice_dispute'],
  pricingPushback: ['pricing_pushback', 'Pricing_Pushback__c'],
  ownerCsm: ['owner_csm', 'CSM__c', 'csm', 'account_owner', 'Owner_Name__c'],
  priorArr: ['prior_arr', 'Prior_ARR__c', 'arr_last_year', 'Prior_Year_ARR__c'],
  lifecycleState: ['lifecycle_state', 'Lifecycle_Stage__c', 'customer_stage'],
} as const;

const LIFECYCLE_STATES: LifecycleState[] = ['new', 'active', 'expanding', 'at_risk', 'churned'];

function mapLifecycle(raw: string): LifecycleState {
  const v = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return (LIFECYCLE_STATES as string[]).includes(v) ? (v as LifecycleState) : 'active';
}

/** Derive segment from an explicit custom field, else from employee count. */
export function mapSegment(account: MergeAccount): Segment {
  const explicit = getStringField(account.custom_fields, [...KEYS.segment], '').toLowerCase();
  if (explicit.includes('enterprise')) return 'enterprise';
  if (explicit.includes('mid')) return 'mid_market';
  if (explicit.includes('smb') || explicit.includes('small')) return 'smb';

  const employees = account.number_of_employees ?? 0;
  if (employees >= 1000) return 'enterprise';
  if (employees >= 100) return 'mid_market';
  return 'smb';
}

/**
 * ARR: prefer an explicit custom field; else the sum of WON opportunities for the
 * account; else 0. We deliberately do NOT fall back to `annual_revenue` — that is
 * company-wide revenue, not our contract value, and would be misleading.
 */
export function mapArr(account: MergeAccount, opportunities: MergeOpportunity[]): number {
  const explicit = getNumberField(account.custom_fields, [...KEYS.arr], NaN);
  if (Number.isFinite(explicit)) return explicit;
  const won = opportunities
    .filter((o) => o.status === 'WON' && typeof o.amount === 'number')
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
  return won;
}

/**
 * Renewal date: prefer a custom field; else the close date of the soonest future
 * OPEN opportunity (the live renewal); else the latest opportunity close date.
 * Returns '' when unknown — the engine tolerates that (renewal signal abstains),
 * exactly as it does for the mock's unparseable dates.
 */
export function mapRenewalDate(
  account: MergeAccount,
  opportunities: MergeOpportunity[],
  now: Date,
): string {
  const explicit = getStringField(account.custom_fields, [...KEYS.renewalDate], '');
  if (explicit) return explicit;

  const dated = opportunities.filter((o) => o.close_date && !Number.isNaN(Date.parse(o.close_date)));
  const futureOpen = dated
    .filter((o) => o.status === 'OPEN' && Date.parse(o.close_date!) >= now.getTime())
    .sort((a, b) => Date.parse(a.close_date!) - Date.parse(b.close_date!));
  if (futureOpen.length > 0) return futureOpen[0]!.close_date!;

  const latest = [...dated].sort((a, b) => Date.parse(b.close_date!) - Date.parse(a.close_date!));
  return latest.length > 0 ? latest[0]!.close_date! : '';
}

const CHAMPION_TITLE_HINTS = ['vp', 'chief', 'head of', 'director', 'owner', 'founder', 'president'];

export function mapContact(c: MergeContact): Contact {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unknown contact';
  const title = c.title ?? '';
  const explicitChampion = getBoolField(c.custom_fields, [...KEYS.isChampion], false);
  const titleSuggestsChampion = CHAMPION_TITLE_HINTS.some((h) => title.toLowerCase().includes(h));
  return {
    id: c.id,
    name,
    title,
    isChampion: explicitChampion || titleSuggestsChampion,
    lastContactedAt: c.last_activity_at ?? null,
    // Engagement is derived from Gong/email activity in a later pass; default medium.
    engagement: 'medium',
  };
}

export function mapInteractionFromCall(call: GongCall): Interaction {
  const summary = call.transcript_summary || call.brief || call.title || 'Call (no summary available)';
  return {
    id: call.id,
    occurredAt: call.started ?? '',
    kind: 'call',
    summary,
  };
}

/** True when a Gong call resolves to this account (matches Merge id or Salesforce remote_id). */
export function callBelongsToAccount(call: GongCall, account: MergeAccount): boolean {
  if (!call.crm_account_id) return false;
  return call.crm_account_id === account.id || call.crm_account_id === account.remote_id;
}

export interface AccountBundle {
  account: MergeAccount;
  contacts: MergeContact[];
  opportunities: MergeOpportunity[];
  tickets: MergeTicket[];
  calls: GongCall[];
}

/**
 * Assemble one normalized domain Account from its vendor bundle. This is the
 * single point where a Salesforce account + its Gong calls + tickets become our
 * `Account`. Tolerant of any piece being empty (SFDC-but-no-Gong, and vice versa).
 */
export function assembleAccount(bundle: AccountBundle, now: Date): Account {
  const { account, contacts, opportunities, tickets, calls } = bundle;
  const cf = account.custom_fields;

  const usageHistory: UsageSnapshot[] = getUsageSeriesField(cf, [...KEYS.usageSeries]);

  // Map Merge Ticketing rows → domain tickets, deriving SLA posture; fall back to
  // custom-field counters if the customer hasn't connected Merge Ticketing but
  // tracks counts in Salesforce.
  const mappedTickets = mapTicketsForAccount(tickets, now);
  const openTickets = tickets.length > 0
    ? mappedTickets.openTickets
    : getNumberField(cf, [...KEYS.openTickets], 0);
  const criticalTickets = tickets.length > 0
    ? mappedTickets.criticalTickets
    : getNumberField(cf, [...KEYS.criticalOpenTickets], 0);

  const interactions: Interaction[] = calls
    .map(mapInteractionFromCall)
    .sort((a, b) => Date.parse(b.occurredAt || '0') - Date.parse(a.occurredAt || '0'));

  const arr = mapArr(account, opportunities);
  const activatedRaw = getStringField(cf, [...KEYS.activatedAt], '');
  const lifecycleRaw = getStringField(cf, [...KEYS.lifecycleState], '');
  return {
    id: account.id,
    name: account.name ?? 'Unnamed account',
    segment: mapSegment(account),
    arr,
    renewalDate: mapRenewalDate(account, opportunities, now),
    licensedSeats: getNumberField(cf, [...KEYS.licensedSeats], 0),
    activeUsers: getNumberField(cf, [...KEYS.activeUsers], 0),
    usageHistory,
    contacts: contacts.map(mapContact),
    interactions,
    openTickets,
    criticalTickets,
    createdAt: account.remote_created_at ?? account.created_at ?? '',
    // Phase 3 fields — mapped from custom fields where present, empty-safe otherwise,
    // so the normalized shape matches the mock exactly.
    responsiveness: [], // computed from email metadata in a later pass; empty for now
    featureUsage: [], // computed from a product-analytics source later; empty for now
    activatedAt: activatedRaw || null,
    billingFlags: {
      overdueInvoice: getBoolField(cf, [...KEYS.overdueInvoice], false),
      disputedInvoice: getBoolField(cf, [...KEYS.disputedInvoice], false),
      pricingPushback: getBoolField(cf, [...KEYS.pricingPushback], false),
    },
    ownerCsm: getStringField(cf, [...KEYS.ownerCsm], ''),
    priorArr: getNumberField(cf, [...KEYS.priorArr], arr),
    lifecycleState: lifecycleRaw ? mapLifecycle(lifecycleRaw) : 'active',
    // Phase 5: help-desk tickets mapped with derived SLA posture.
    tickets: mappedTickets.tickets,
    opportunities: (opportunities ?? [])
      .filter((o) => typeof o.amount === 'number')
      .map((o) => ({
        id: o.id,
        name: o.name ?? 'Opportunity',
        amount: o.amount ?? 0,
        stage: mapOppStage(o.status),
        isExpansion: /expansion|upsell|add-on|cross-sell/i.test(o.name ?? ''),
      })),
    trendSeries: [], // accrues as SignalOS runs; empty until then (no false sparkline)
  };
}

function mapOppStage(status: string | null): import('../../domain').OpportunityStage {
  if (status === 'WON') return 'closed_won';
  if (status === 'LOST') return 'closed_lost';
  return 'qualified';
}
