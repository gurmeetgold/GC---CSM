import type { DataSource } from './DataSource';
import { MockDataSource } from './mock/MockDataSource';
import { UnifiedApiDataSource, type UnifiedApiLogger } from './live/UnifiedApiDataSource';
import type { GongClient, MergeClient } from './live/clients';

export type { DataSource } from './DataSource';
export { MockDataSource } from './mock/MockDataSource';
export { UnifiedApiDataSource } from './live/UnifiedApiDataSource';

export type DataSourceKind = 'mock' | 'live';

/** Dependencies the live source needs — built server-side (never in the browser). */
export interface LiveDataSourceDeps {
  merge: MergeClient;
  gong?: GongClient | null;
  logger?: UnifiedApiLogger;
}

/**
 * The single selection point. The app reads ONE flag (DATA_SOURCE=mock|live) and
 * gets back a `DataSource`. Everything downstream depends only on the interface and
 * cannot tell which implementation it received.
 *
 * `live` requires injected vendor clients (assembled from secrets by the server-side
 * factory in src/server/factory.ts, or by fixture clients in tests). This factory
 * itself reads no env and touches no secrets, so it stays browser-safe.
 */
export function createDataSource(kind: DataSourceKind, deps?: LiveDataSourceDeps): DataSource {
  switch (kind) {
    case 'mock':
      return new MockDataSource();
    case 'live':
      if (!deps?.merge) {
        throw new Error(
          'live data source requires vendor clients. Build them server-side via ' +
            'createLiveDataSource() (src/server/factory.ts); the browser must use DATA_SOURCE=mock.',
        );
      }
      return new UnifiedApiDataSource(deps.merge, deps.gong ?? null, deps.logger);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown data source: ${String(_exhaustive)}`);
    }
  }
}

/** Resolve the configured kind from the environment, defaulting to mock. */
export function resolveDataSourceKind(raw: string | undefined): DataSourceKind {
  return raw === 'live' ? 'live' : 'mock';
}
