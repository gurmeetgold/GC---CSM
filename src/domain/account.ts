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

export interface Contact {
  id: string;
  name: string;
  title: string;
  /** The key stakeholder whose silence we track. An account may have 0..n champions. */
  isChampion: boolean;
  /** ISO date of last meaningful contact, or null if never contacted. */
  lastContactedAt: string | null;
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
}
