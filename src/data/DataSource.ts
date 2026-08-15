import type { Account } from '../domain';

/**
 * Per-integration connection status, so the UI can honestly show what's wired up:
 *   - connected     — the source is reachable and returned data
 *   - not_connected — the source isn't configured / linked yet
 *   - cold_start    — connected but the account has little/no data yet
 */
export type ConnectionStatus = 'connected' | 'not_connected' | 'cold_start';

export interface SourceConnection {
  /** Human label, e.g. "Merge CRM", "Merge Ticketing", "Sample data". */
  name: string;
  status: ConnectionStatus;
  /** Optional one-line detail for the UI (never a secret). */
  detail?: string;
}

/**
 * The data-source seam.
 *
 * Every data source — MockDataSource today, UnifiedApiDataSource later — emits
 * the IDENTICAL normalized `Account` shape. App and UI code depend only on this
 * interface and must never branch on which implementation is behind it.
 *
 * The mock is not a throwaway: it is the permanent instant-demo path and the
 * integration-test harness. The live source is added BESIDE it, never in place
 * of it.
 */
export interface DataSource {
  /** Stable identifier for diagnostics/logging (e.g. "mock", "unified-api"). */
  readonly name: string;
  /**
   * The "as-of" clock the engine should evaluate this source's data against.
   * The mock is anchored to a fixed reference date so its risk states are
   * reproducible; the live source returns the real clock. Exposing it here keeps
   * the UI from ever having to branch on which source is active.
   */
  now(): Date;
  /** All accounts in the CSM's book of business. */
  listAccounts(): Promise<Account[]>;
  /** A single account by id, or null if not found. */
  getAccount(id: string): Promise<Account | null>;
  /**
   * Status of the underlying integrations, so the UI can honestly show
   * connected / not-connected / cold-start. The mock reports a single synthetic
   * "Sample data" connection; the live source reports one entry per real source.
   */
  connections(): SourceConnection[];
}
