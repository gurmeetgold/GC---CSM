import type { DataSource } from './DataSource';
import { MockDataSource } from './mock/MockDataSource';

export type { DataSource } from './DataSource';
export { MockDataSource } from './mock/MockDataSource';

export type DataSourceKind = 'mock' | 'live';

/**
 * The single selection point. The app reads ONE flag (VITE_DATA_SOURCE=mock|live)
 * and gets back a `DataSource`. Everything downstream depends only on the
 * interface and cannot tell which implementation it received.
 *
 * The live branch is intentionally a clear failure in Phase 1 — the seam exists,
 * the implementation lands in Phase 2 beside (not replacing) the mock.
 */
export function createDataSource(kind: DataSourceKind): DataSource {
  switch (kind) {
    case 'mock':
      return new MockDataSource();
    case 'live':
      throw new Error(
        'UnifiedApiDataSource is not available in Phase 1. Set VITE_DATA_SOURCE=mock. ' +
          'The live source implements the same DataSource interface and drops in here in Phase 2.',
      );
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
