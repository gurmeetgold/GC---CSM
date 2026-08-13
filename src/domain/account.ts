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
}

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
}
