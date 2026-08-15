import type { GongClient, MergeClient } from '../clients';
import { SourceUnavailableError } from '../clients';
import type {
  GongCall,
  MergeAccount,
  MergeContact,
  MergeOpportunity,
  MergeTicket,
} from '../vendorTypes';

/**
 * Recorded-style vendor payloads covering the real-world mess:
 *   - acct-clean: well-configured org, all custom fields present, Gong calls.
 *   - acct-nogong: Salesforce data but zero Gong calls.
 *   - acct-messy: missing/renamed custom fields, null contact activity, custom
 *     naming (`Licensed_Seats__c`), string-typed numbers.
 *   - acct-sparse: brand-new account, almost nothing set (cold-start-like).
 * A Gong call also exists with an unmatched crm_account_id (must be ignored).
 */

export const FIXTURE_ACCOUNTS: MergeAccount[] = [
  {
    id: 'acct-clean',
    remote_id: 'sf-001',
    name: 'Clean Corp',
    industry: 'Software',
    annual_revenue: 50_000_000,
    number_of_employees: 1200, // → enterprise
    created_at: '2023-01-01T00:00:00Z',
    remote_created_at: '2023-01-01T00:00:00Z',
    custom_fields: {
      arr: 240_000,
      renewal_date: '2026-10-01',
      licensed_seats: 100,
      active_users: 90,
      usage_history: JSON.stringify([
        { asOf: '2026-05-15', activeUsers: 92 },
        { asOf: '2026-06-15', activeUsers: 91 },
        { asOf: '2026-07-15', activeUsers: 90 },
      ]),
    },
  },
  {
    id: 'acct-nogong',
    remote_id: 'sf-002',
    name: 'No Gong Inc',
    industry: 'Retail',
    annual_revenue: null,
    number_of_employees: 300, // → mid_market
    created_at: '2022-06-01T00:00:00Z',
    remote_created_at: '2022-06-01T00:00:00Z',
    custom_fields: {
      ARR: '120000', // string-typed, alternate casing
      Licensed_Seats__c: 60,
      Active_Users__c: 20, // adoption gap territory
      Renewal_Date__c: '2026-09-01',
    },
  },
  {
    id: 'acct-messy',
    remote_id: 'sf-003',
    name: null, // missing name → default
    industry: null,
    annual_revenue: null,
    number_of_employees: 40, // → smb
    created_at: '2021-03-01T00:00:00Z',
    remote_created_at: null,
    custom_fields: {
      // No arr custom field → fall back to WON opportunities.
      seats: '30', // alternate key, string
      // no active_users at all → 0
    },
  },
  {
    id: 'acct-sparse',
    remote_id: 'sf-004',
    name: 'Sparse LLC',
    industry: null,
    annual_revenue: null,
    number_of_employees: null,
    created_at: '2026-08-01T00:00:00Z', // very new
    remote_created_at: '2026-08-01T00:00:00Z',
    custom_fields: null,
  },
];

export const FIXTURE_CONTACTS: MergeContact[] = [
  {
    id: 'c-clean-1', remote_id: 'sfc-1', first_name: 'Dana', last_name: 'Reed',
    title: 'VP of Operations', account: 'acct-clean', last_activity_at: '2026-08-01T00:00:00Z',
    custom_fields: { is_champion: true },
  },
  {
    id: 'c-nogong-1', remote_id: 'sfc-2', first_name: 'Sam', last_name: 'Ortiz',
    title: 'Analyst', account: 'acct-nogong', last_activity_at: null, custom_fields: null,
  },
  {
    id: 'c-messy-1', remote_id: 'sfc-3', first_name: 'Lee', last_name: null,
    title: 'Director of IT', account: 'acct-messy', last_activity_at: '2026-05-01T00:00:00Z',
    custom_fields: null, // champion inferred from title
  },
];

export const FIXTURE_OPPORTUNITIES: MergeOpportunity[] = [
  {
    id: 'o-messy-1', remote_id: 'sfo-1', name: 'Messy renewal', amount: 45_000,
    status: 'WON', close_date: '2025-01-01', account: 'acct-messy', custom_fields: null,
  },
  {
    id: 'o-messy-2', remote_id: 'sfo-2', name: 'Messy upsell', amount: 15_000,
    status: 'OPEN', close_date: '2026-09-20', account: 'acct-messy', custom_fields: null,
  },
];

// Anchored so SLA derivation is deterministic in tests (now = 2026-08-13).
export const FIXTURE_TICKETS: MergeTicket[] = [
  // Open, URGENT, past-due → breached; P1.
  { id: 't1', name: 'Login broken for admins', status: 'OPEN', priority: 'URGENT', account: 'acct-clean', created_at: '2026-08-07T00:00:00Z', modified_at: '2026-08-10T00:00:00Z', due_date: '2026-08-10T00:00:00Z' },
  // Open, NORMAL, due far in the future → ok; P3.
  { id: 't2', name: 'Question about exports', status: 'OPEN', priority: 'NORMAL', account: 'acct-clean', created_at: '2026-08-11T00:00:00Z', modified_at: '2026-08-11T00:00:00Z', due_date: '2026-09-01T00:00:00Z' },
  // Closed → resolved, SLA ok; P2.
  { id: 't3', name: 'Permissions request', status: 'CLOSED', priority: 'HIGH', account: 'acct-clean', created_at: '2026-07-01T00:00:00Z', modified_at: '2026-07-05T00:00:00Z', due_date: null },
];

export const FIXTURE_CALLS: GongCall[] = [
  {
    id: 'call-1', title: 'Clean Corp QBR', started: '2026-08-05T00:00:00Z',
    crm_account_id: 'sf-001', brief: 'Positive QBR, discussed expansion.',
    transcript_summary: 'Customer is happy and asked about adding seats next quarter.',
  },
  {
    id: 'call-unmatched', title: 'Unknown', started: '2026-08-06T00:00:00Z',
    crm_account_id: 'sf-999', brief: 'Should not attach to any account.', transcript_summary: null,
  },
];

// ---- Fixture clients ------------------------------------------------------

export function makeMergeClient(overrides: Partial<MergeClient> = {}): MergeClient {
  return {
    vendor: 'merge',
    listAccounts: async () => FIXTURE_ACCOUNTS,
    listContacts: async () => FIXTURE_CONTACTS,
    listOpportunities: async () => FIXTURE_OPPORTUNITIES,
    listTickets: async () => FIXTURE_TICKETS,
    ...overrides,
  };
}

export function makeGongClient(overrides: Partial<GongClient> = {}): GongClient {
  return {
    vendor: 'gong',
    listCalls: async () => FIXTURE_CALLS,
    ...overrides,
  };
}

/** A client method that simulates a vendor being down. */
export function failing(vendor: 'merge' | 'gong', reason = 'simulated outage') {
  return async () => {
    throw new SourceUnavailableError(vendor, reason, 503);
  };
}
