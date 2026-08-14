/**
 * Domain: the normalized account shape.
 *
 * This is the contract that EVERY DataSource must emit identically —
 * MockDataSource today, UnifiedApiDataSource later. No Salesforce/Gong field
 * names leak in here; vendor schemas are normalized to this at the data boundary.
 *
 * Dates are ISO-8601 strings ("2026-08-13") at this boundary and parsed inside
 * the engine. This keeps the domain serializable and source-agnostic.
 */

export type Segment = 'smb' | 'mid_market' | 'enterprise';

export type EngagementLevel = 'low' | 'medium' | 'high';

export interface Contact {
  id: string;
  name: string;
  title: string;
  /** The key stakeholder whose silence we track. An account may have 0..n champions. */
  isChampion: boolean;
  /** ISO date of last meaningful contact, or null if never contacted. */
  lastContactedAt: string | null;
  /**
   * Relationship engagement, derived from conversation intelligence (Gong) + email
   * activity — NOT product usage. 'low' on a decision-maker is a real risk.
   */
  engagement: EngagementLevel;
}

/**
 * A help-desk ticket (Zendesk / Jira Service Management / Intercom). Everything here
 * is honestly sourceable from the ticketing integration — no engineering/incident
 * tooling. Powers the Support & Technical Attention view and ties ticket strain to
 * account risk.
 */
export type TicketSeverity = 'p1' | 'p2' | 'p3';
export type SlaStatus = 'ok' | 'at_risk' | 'breached';
export type TicketTone = 'neutral' | 'negative' | 'frustrated';

export interface SupportTicket {
  id: string;
  subject: string;
  severity: TicketSeverity;
  openedAt: string; // ISO date
  /** true once resolved; open tickets drive attention. */
  resolved: boolean;
  /** SLA posture from the help desk. */
  slaStatus: SlaStatus;
  /** Tone read from the ticket wording (help-desk text) — feeds support sentiment. */
  tone: TicketTone;
}

/**
 * A CRM opportunity (Salesforce / HubSpot). The ONLY honest source of an expansion
 * dollar amount — we never model a valuation from product usage we don't have.
 */
export type OpportunityStage =
  | 'identified' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

export interface CrmOpportunity {
  id: string;
  name: string;
  amount: number;
  stage: OpportunityStage;
  /** true when this is an expansion/upsell opp (vs. the original new-business deal). */
  isExpansion: boolean;
}

export type InteractionKind = 'call' | 'email' | 'meeting' | 'support';

export interface Interaction {
  id: string;
  occurredAt: string; // ISO date
  kind: InteractionKind;
  /** Human summary. Shown in the UI now; consumed by Claude for soft signals later. */
  summary: string;
}

export interface UsageSnapshot {
  asOf: string; // ISO date
  activeUsers: number;
  /** Total logins in the period. Optional; enables the stickiness (logins/user) signal. */
  logins?: number;
}

/** Trailing email-responsiveness metrics for a window ending at `asOf`. */
export interface ResponsivenessSnapshot {
  asOf: string; // ISO date
  /** Median hours for the customer to reply to our outreach in the window. */
  medianReplyHours: number;
  /** Share of our outreach that got any reply, 0–100. */
  replyRatePct: number;
}

/** Per-feature usage, so we can detect a key feature being abandoned. */
export interface FeatureUsage {
  key: string;
  label: string;
  /** Core/high-value feature — only these drive the feature-depth signal. */
  isKeyFeature: boolean;
  /** Usage counts over time, oldest → newest. */
  history: { asOf: string; uses: number }[];
}

/** Billing/contract friction flags. */
export interface BillingFlags {
  overdueInvoice: boolean;
  disputedInvoice: boolean;
  pricingPushback: boolean;
}

/**
 * Coarse lifecycle/commercial state used ONLY by the leadership roll-ups
 * (NRR/GRR, expansion, churn-reason inference). Never consumed by the signal
 * engine, which stays purely signal-driven.
 */
export type LifecycleState = 'new' | 'active' | 'expanding' | 'at_risk' | 'churned';

export interface Account {
  id: string;
  name: string;
  segment: Segment;
  /** Annualized contract value. */
  arr: number;
  renewalDate: string; // ISO date
  licensedSeats: number;
  /** Current active-user count. */
  activeUsers: number;
  /**
   * Trailing usage snapshots, ordered oldest → newest. May be sparse or empty
   * (a cold-start account has little or no history — signals must tolerate that).
   */
  usageHistory: UsageSnapshot[];
  contacts: Contact[];
  /** Recent interactions, newest → oldest. May be empty (cold-start). */
  interactions: Interaction[];
  openTickets: number;
  criticalTickets: number;
  /** Account creation date — drives cold-start handling. */
  createdAt: string; // ISO date

  // ---- Phase 3 additions. Required (with empty defaults) so mock and live stay
  // key-for-key identical; the live adapter maps each from custom fields / Gong. ----

  /** Trailing email-responsiveness metrics, oldest → newest. May be empty. */
  responsiveness: ResponsivenessSnapshot[];
  /** Per-feature usage. May be empty. */
  featureUsage: FeatureUsage[];
  /** When the account reached its activation milestone, or null if not yet. */
  activatedAt: string | null;
  /** Billing/contract friction flags. */
  billingFlags: BillingFlags;

  // ---- Leadership-only fields (not read by the signal engine) ----

  /** Owning CSM — powers book-balance and per-CSM leadership reports. */
  ownerCsm: string;
  /** ARR one renewal-cycle ago — powers NRR/GRR (expansion vs. contraction). */
  priorArr: number;
  /** Coarse commercial state — powers NRR/GRR and churn-reason inference. */
  lifecycleState: LifecycleState;

  // ---- Phase 4 additions (help desk / CRM / Gong; both sources emit them) ----

  /** Help-desk tickets (open + recently resolved). Powers the Support view. */
  tickets: SupportTicket[];
  /** CRM opportunities — the honest source of expansion dollar amounts. */
  opportunities: CrmOpportunity[];
  /**
   * A short trailing health/engagement trend for row + tile sparklines, oldest →
   * newest (0–100). MODELED for the demo; empty for cold-start / thin-data accounts
   * (which therefore render no sparkline — honesty over decoration). In production
   * this series accrues as SignalOS runs; it is never a warehouse-grade usage figure.
   */
  trendSeries: number[];
}
