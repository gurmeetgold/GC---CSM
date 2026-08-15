import type { Account } from '../../domain';
import type { DataSource, SourceConnection } from '../DataSource';
import type { MergeClient } from './clients';
import { SourceUnavailableError } from './clients';
import { assembleAccount, type AccountBundle } from './mappers';
import type { MergeContact, MergeOpportunity } from './vendorTypes';

export interface MergeLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}
const noopLogger: MergeLogger = { warn: () => {} };

/**
 * Merge unified CRM → domain `Account` (CRM only — no tickets, no calls).
 *
 * A first-class `DataSource` in its own right: a CRM-only deployment can use it
 * directly. The composite live source (UnifiedApiDataSource) enriches its output
 * with the ticketing + conversation adapters. One Merge client, shared across the
 * CRM and Ticketing adapters (one linked-account connection, two categories).
 *
 * Graceful degradation: the account list is the backbone (a failure surfaces);
 * contacts and opportunities each degrade to empty independently.
 */
export class MergeCrmSource implements DataSource {
  readonly name = 'merge-crm';
  private synced = false;
  private lastCount = 0;

  constructor(private readonly merge: MergeClient, private readonly logger: MergeLogger = noopLogger) {}

  now(): Date {
    return new Date();
  }

  async listAccounts(): Promise<Account[]> {
    const now = this.now();
    const accounts = await this.merge.listAccounts(); // backbone — throws if unreachable
    const [contacts, opportunities] = await Promise.all([
      this.safe(() => this.merge.listContacts(), [] as MergeContact[]),
      this.safe(() => this.merge.listOpportunities(), [] as MergeOpportunity[]),
    ]);

    const contactsByAccount = groupBy(contacts, (c) => c.account);
    const oppsByAccount = groupBy(opportunities, (o) => o.account);

    this.synced = true;
    this.lastCount = accounts.length;

    return accounts.map((account) => {
      const bundle: AccountBundle = {
        account,
        contacts: contactsByAccount.get(account.id) ?? [],
        opportunities: oppsByAccount.get(account.id) ?? [],
        tickets: [], // ticketing is a separate adapter
        calls: [], // conversations are a separate adapter
      };
      return assembleAccount(bundle, now);
    });
  }

  async getAccount(id: string): Promise<Account | null> {
    return (await this.listAccounts()).find((a) => a.id === id) ?? null;
  }

  connections(): SourceConnection[] {
    if (!this.synced) return [{ name: 'Merge CRM', status: 'not_connected' }];
    return [{
      name: 'Merge CRM',
      status: this.lastCount > 0 ? 'connected' : 'cold_start',
      detail: this.lastCount > 0 ? `${this.lastCount} accounts` : 'connected, no accounts yet',
    }];
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      this.logger.warn('merge-crm sub-fetch degraded to empty', { reason });
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
