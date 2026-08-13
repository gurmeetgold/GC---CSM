import { useEffect, useState } from 'react';
import { createDataSource, resolveDataSourceKind, type DataSource } from '../data';
import { evaluate } from '../engine';
import { DEFAULT_THRESHOLDS } from '../domain';
import type { EvaluatedAccount } from '../answer';

interface BookState {
  loading: boolean;
  error: string | null;
  book: EvaluatedAccount[];
  sourceName: string;
  /** The clock the active source's data was evaluated against. */
  now: Date;
}

/**
 * Loads the book of business from the configured DataSource and runs every
 * account through the signal engine. The UI consumes only the resulting
 * EvaluatedAccount[] — it never knows or cares which data source produced it.
 */
export function useBook(): BookState {
  const [state, setState] = useState<BookState>({
    loading: true,
    error: null,
    book: [],
    sourceName: '',
    now: new Date(),
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const kind = resolveDataSourceKind(import.meta.env.VITE_DATA_SOURCE as string | undefined);
        const source: DataSource = createDataSource(kind);
        const now = source.now();
        const accounts = await source.listAccounts();
        const book: EvaluatedAccount[] = accounts.map((account) => ({
          account,
          evaluation: evaluate(account, DEFAULT_THRESHOLDS, now),
        }));
        if (!cancelled) {
          setState({ loading: false, error: null, book, sourceName: source.name, now });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load the book of business.',
            book: [],
            sourceName: '',
            now: new Date(),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
