/**
 * Raw vendor payload shapes — Merge (unified CRM/Ticketing) and Gong.
 *
 * These types and every vendor field name (`annual_revenue`, `custom_fields`,
 * `crm_account_id`, …) are QUARANTINED to src/data/live/. Nothing outside this
 * directory may import them; the mappers translate them into the domain model and
 * the rest of the app speaks only domain. The isolation pass greps for exactly this.
 *
 * Shapes are intentionally loose (lots of `| null`, optional custom fields) because
 * that is the real world: per-org Salesforce config differs, custom fields go
 * missing, and one system can have data the other lacks.
 */

// ---- Merge unified CRM ----------------------------------------------------

export interface MergeAccount {
  id: string;
  remote_id: string | null;
  name: string | null;
  industry: string | null;
  annual_revenue: number | null;
  number_of_employees: number | null;
  created_at: string | null;
  remote_created_at: string | null;
  /** Normalized custom fields Merge surfaces from Salesforce (per-org, may be absent). */
  custom_fields?: Record<string, unknown> | null;
}

export interface MergeContact {
  id: string;
  remote_id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  /** Merge account id this contact belongs to. */
  account: string | null;
  last_activity_at: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export type MergeOpportunityStatus = 'OPEN' | 'WON' | 'LOST' | null;

export interface MergeOpportunity {
  id: string;
  remote_id: string | null;
  name: string | null;
  amount: number | null;
  status: MergeOpportunityStatus;
  close_date: string | null;
  account: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export type MergeTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'CLOSED' | null;
export type MergeTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | null;

export interface MergeTicket {
  id: string;
  status: MergeTicketStatus;
  priority: MergeTicketPriority;
  /** Merge account id, when the ticketing system associates one. */
  account: string | null;
}

// ---- Gong conversation intelligence ---------------------------------------

export interface GongCall {
  id: string;
  title: string | null;
  /** ISO timestamp the call started. */
  started: string | null;
  /** CRM account id Gong resolved this call to (may be null / unmatched). */
  crm_account_id: string | null;
  /** Short brief Gong generates; may be absent for un-processed calls. */
  brief: string | null;
  /** Optional longer transcript summary, used for soft-signal extraction. */
  transcript_summary: string | null;
}
