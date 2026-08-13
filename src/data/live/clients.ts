import type {
  GongCall,
  MergeAccount,
  MergeContact,
  MergeOpportunity,
  MergeTicket,
} from './vendorTypes';

/**
 * Vendor client seams. The UnifiedApiDataSource depends only on these interfaces,
 * so tests inject fixture clients and NEVER hit a live API. The real HTTP-backed
 * implementations live in httpClients.ts.
 *
 * Each method returns already-paginated, fully-collected raw vendor rows. A client
 * that cannot reach its vendor throws `SourceUnavailableError` — the data source
 * catches it per-source and degrades gracefully rather than crashing the account.
 */
export interface MergeClient {
  readonly vendor: 'merge';
  listAccounts(): Promise<MergeAccount[]>;
  listContacts(): Promise<MergeContact[]>;
  listOpportunities(): Promise<MergeOpportunity[]>;
  /** Ticketing is a separate Merge category a customer may not have connected. */
  listTickets(): Promise<MergeTicket[]>;
}

export interface GongClient {
  readonly vendor: 'gong';
  listCalls(): Promise<GongCall[]>;
}

/** Thrown when a vendor is unreachable/misconfigured so callers can degrade per-source. */
export class SourceUnavailableError extends Error {
  constructor(
    public readonly vendor: 'merge' | 'gong',
    public readonly reason: string,
    public readonly status?: number,
  ) {
    super(`[${vendor}] unavailable: ${reason}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'SourceUnavailableError';
  }
}
