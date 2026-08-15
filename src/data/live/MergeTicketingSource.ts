import type { SupportTicket } from '../../domain';
import type { SourceConnection } from '../DataSource';
import type { MergeClient } from './clients';
import { SourceUnavailableError } from './clients';
import { mapTicketsForAccount } from './ticketMappers';

export interface MergeLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}
const noopLogger: MergeLogger = { warn: () => {} };

export interface AccountTickets {
  tickets: SupportTicket[];
  openTickets: number;
  criticalTickets: number;
}

/**
 * Merge Ticketing → domain support tickets, grouped by account. Uses the SAME Merge
 * client as the CRM adapter (one connection, two categories). An enricher, not a
 * standalone `DataSource` (help-desk tickets aren't a book of accounts).
 *
 * Ticketing is a separately-connected Merge category; if it isn't connected the
 * fetch fails and this degrades to an empty map — the app still renders, accounts
 * simply have no tickets.
 */
export class MergeTicketingSource {
  readonly name = 'merge-ticketing';
  private synced = false;
  private lastTicketCount = 0;
  private lastError = false;

  constructor(private readonly merge: MergeClient, private readonly logger: MergeLogger = noopLogger) {}

  /** Fetch + map all tickets, grouped by account id. Degrades to empty on failure. */
  async load(now: Date): Promise<Map<string, AccountTickets>> {
    let raw;
    try {
      raw = await this.merge.listTickets();
      this.synced = true;
      this.lastError = false;
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      this.logger.warn('merge-ticketing unavailable; no tickets', { reason });
      this.lastError = true;
      return new Map();
    }

    this.lastTicketCount = raw.length;
    const byAccount = new Map<string, typeof raw>();
    for (const t of raw) {
      if (!t.account) continue;
      const list = byAccount.get(t.account) ?? [];
      list.push(t);
      byAccount.set(t.account, list);
    }

    const out = new Map<string, AccountTickets>();
    for (const [accountId, tickets] of byAccount) {
      out.set(accountId, mapTicketsForAccount(tickets, now));
    }
    return out;
  }

  connections(): SourceConnection[] {
    if (this.lastError) return [{ name: 'Merge Ticketing', status: 'not_connected', detail: 'help desk not connected' }];
    if (!this.synced) return [{ name: 'Merge Ticketing', status: 'not_connected' }];
    return [{
      name: 'Merge Ticketing',
      status: this.lastTicketCount > 0 ? 'connected' : 'cold_start',
      detail: this.lastTicketCount > 0 ? `${this.lastTicketCount} tickets` : 'connected, no tickets yet',
    }];
  }
}
