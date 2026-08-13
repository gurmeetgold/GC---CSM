import type { Account } from '../../domain';
import type { DataSource } from '../DataSource';
import { MOCK_ACCOUNTS } from './accounts';
import { REFERENCE_NOW } from './referenceTime';

/**
 * The permanent mock data source: the instant-demo path (no credentials needed)
 * and the integration-test harness. It emits exactly the normalized `Account`
 * shape the live source will emit, so the two can never silently drift apart.
 *
 * Async on purpose — it mirrors the network-bound signature of the future
 * UnifiedApiDataSource so nothing downstream needs to change when the live
 * source is dropped in beside it.
 */
export class MockDataSource implements DataSource {
  readonly name = 'mock';

  constructor(private readonly accounts: Account[] = MOCK_ACCOUNTS) {}

  now(): Date {
    return REFERENCE_NOW;
  }

  async listAccounts(): Promise<Account[]> {
    // Return copies so callers can't mutate the fixture between reads.
    return this.accounts.map((a) => structuredClone(a));
  }

  async getAccount(id: string): Promise<Account | null> {
    const found = this.accounts.find((a) => a.id === id);
    return found ? structuredClone(found) : null;
  }
}
