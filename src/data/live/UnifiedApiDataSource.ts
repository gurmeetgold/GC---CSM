import type { Account } from '../../domain';
import type { DataSource, SourceConnection, ConnectionStatus } from '../DataSource';
import type { GongClient, MergeClient } from './clients';
import { SourceUnavailableError } from './clients';
import { assembleAccount, callBelongsToAccount, type AccountBundle } from './mappers';
import type { GongCall, MergeContact, MergeOpportunity, MergeTicket } from './vendorTypes';

export interface UnifiedApiLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: UnifiedApiLogger = { warn: () => {} };

interface SubResult<T> { ok: boolean; value: T[]; count: number }

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

  /** Per-source connection status from the last sync (for the UI). */
  private lastConnections: SourceConnection[] = [
    { name: 'Merge CRM', status: 'not_connected' },
    { name: 'Merge Ticketing', status: 'not_connected' },
    { name: 'Gong', status: this.gong ? 'not_connected' : 'not_connected' },
  ];

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

    // Best-effort side data — each degrades to [] independently, tracking status.
    const [contacts, opportunities, tickets, calls] = await Promise.all([
      this.tracked('merge', () => this.merge.listContacts(), [] as MergeContact[]),
      this.tracked('merge', () => this.merge.listOpportunities(), [] as MergeOpportunity[]),
      this.tracked('merge', () => this.merge.listTickets(), [] as MergeTicket[]),
      this.gong
        ? this.tracked('gong', () => this.gong!.listCalls(), [] as GongCall[])
        : Promise.resolve({ ok: false, value: [] as GongCall[], count: 0 }),
    ]);

    // Record connection status for the UI.
    const status = (ok: boolean, count: number): ConnectionStatus =>
      !ok ? 'not_connected' : count > 0 ? 'connected' : 'cold_start';
    this.lastConnections = [
      { name: 'Merge CRM', status: accounts.length > 0 ? 'connected' : 'cold_start', detail: `${accounts.length} accounts` },
      { name: 'Merge Ticketing', status: status(tickets.ok, tickets.count), detail: tickets.ok ? `${tickets.count} tickets` : 'help desk not connected' },
      { name: 'Gong', status: this.gong ? status(calls.ok, calls.count) : 'not_connected', detail: this.gong ? `${calls.count} calls` : 'not connected' },
    ];

    // Index side data by account for O(n) assembly.
    const contactsByAccount = groupBy(contacts.value, (c) => c.account);
    const oppsByAccount = groupBy(opportunities.value, (o) => o.account);
    const ticketsByAccount = groupBy(tickets.value, (t) => t.account);
    const callsValue = calls.value;

    return accounts.map((account) => {
      const bundle: AccountBundle = {
        account,
        contacts: contactsByAccount.get(account.id) ?? [],
        opportunities: oppsByAccount.get(account.id) ?? [],
        tickets: ticketsByAccount.get(account.id) ?? [],
        calls: callsValue.filter((call) => callBelongsToAccount(call, account)),
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

  connections(): SourceConnection[] {
    return this.lastConnections;
  }

  /** Best-effort fetch tracking success + row count; on any error, log and degrade to empty. */
  private async tracked<T>(vendor: 'merge' | 'gong', fn: () => Promise<T[]>, fallback: T[]): Promise<SubResult<T>> {
    try {
      const value = await fn();
      return { ok: true, value, count: value.length };
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      this.logger.warn(`${vendor} sub-fetch degraded to empty`, { reason });
      return { ok: false, value: fallback, count: 0 };
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
    responsiveness: [],
    featureUsage: [],
    activatedAt: null,
    billingFlags: { overdueInvoice: false, disputedInvoice: false, pricingPushback: false },
    ownerCsm: '',
    priorArr: 0,
    lifecycleState: 'active',
    tickets: [],
    opportunities: [],
    trendSeries: [],
  };
}
