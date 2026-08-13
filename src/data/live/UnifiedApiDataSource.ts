import type { Account } from '../../domain';
import type { DataSource } from '../DataSource';
import type { GongClient, MergeClient } from './clients';
import { SourceUnavailableError } from './clients';
import { assembleAccount, callBelongsToAccount, type AccountBundle } from './mappers';
import type { GongCall, MergeContact, MergeOpportunity, MergeTicket } from './vendorTypes';

export interface UnifiedApiLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: UnifiedApiLogger = { warn: () => {} };

/**
 * The real live data source: unified Salesforce (via Merge) + Gong, mapped to the
 * exact same normalized `Account` shape MockDataSource emits. The contract test
 * proves they don't drift.
 *
 * Graceful degradation is a first-class concern:
 *   - The CRM account list is the backbone; if it is unreachable there is no book
 *     to render, so that error surfaces.
 *   - Every OTHER fetch (contacts, opportunities, tickets, Gong calls) is best-
 *     effort: a failure degrades that dimension to empty and logs a warning, so a
 *     flaky Gong or an unconnected Ticketing category never crashes an account.
 */
export class UnifiedApiDataSource implements DataSource {
  readonly name = 'unified-api';

  constructor(
    private readonly merge: MergeClient,
    private readonly gong: GongClient | null = null,
    private readonly logger: UnifiedApiLogger = noopLogger,
  ) {}

  now(): Date {
    return new Date();
  }

  async listAccounts(): Promise<Account[]> {
    const now = this.now();

    // Backbone: the CRM account list. A failure here is fatal to the whole book.
    const accounts = await this.merge.listAccounts();

    // Best-effort side data — each degrades to [] independently.
    const [contacts, opportunities, tickets, calls] = await Promise.all([
      this.safe('merge', () => this.merge.listContacts(), [] as MergeContact[]),
      this.safe('merge', () => this.merge.listOpportunities(), [] as MergeOpportunity[]),
      this.safe('merge', () => this.merge.listTickets(), [] as MergeTicket[]),
      this.gong
        ? this.safe('gong', () => this.gong!.listCalls(), [] as GongCall[])
        : Promise.resolve([] as GongCall[]),
    ]);

    // Index side data by account for O(n) assembly.
    const contactsByAccount = groupBy(contacts, (c) => c.account);
    const oppsByAccount = groupBy(opportunities, (o) => o.account);
    const ticketsByAccount = groupBy(tickets, (t) => t.account);

    return accounts.map((account) => {
      const bundle: AccountBundle = {
        account,
        contacts: contactsByAccount.get(account.id) ?? [],
        opportunities: oppsByAccount.get(account.id) ?? [],
        tickets: ticketsByAccount.get(account.id) ?? [],
        calls: calls.filter((call) => callBelongsToAccount(call, account)),
      };
      // One bad account must not sink the whole book.
      try {
        return assembleAccount(bundle, now);
      } catch (err) {
        this.logger.warn('failed to assemble account; emitting minimal record', {
          accountId: account.id,
          error: String(err),
        });
        return minimalAccount(account.id, account.name ?? 'Unnamed account');
      }
    });
  }

  async getAccount(id: string): Promise<Account | null> {
    const all = await this.listAccounts();
    return all.find((a) => a.id === id) ?? null;
  }

  /** Run a best-effort fetch; on SourceUnavailableError (or any error) log and return the fallback. */
  private async safe<T>(vendor: 'merge' | 'gong', fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      this.logger.warn(`${vendor} sub-fetch degraded to empty`, { reason });
      return fallback;
    }
  }
}

function groupBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** A safe, shape-complete Account for an account we couldn't fully assemble. */
function minimalAccount(id: string, name: string): Account {
  return {
    id,
    name,
    segment: 'smb',
    arr: 0,
    renewalDate: '',
    licensedSeats: 0,
    activeUsers: 0,
    usageHistory: [],
    contacts: [],
    interactions: [],
    openTickets: 0,
    criticalTickets: 0,
    createdAt: '',
  };
}
