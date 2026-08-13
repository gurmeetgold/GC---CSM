import { useEffect, useState } from 'react';
import type { EvaluatedAccount } from '../answer';
import { resolveBookProvider } from './bookProvider';

interface BookState {
  loading: boolean;
  error: string | null;
  book: EvaluatedAccount[];
  sourceName: string;
  /** The clock the active source's data was evaluated against. */
  now: Date;
  /** accountId → narrative reasoning (populated by the backend in live mode). */
  reasoning: Record<string, string>;
}

/**
 * Loads the evaluated book through the configured BookProvider — the local mock+engine
 * in the browser, or the backend host in live mode. The UI consumes only the resulting
 * EvaluatedAccount[]; it never knows which provider produced it.
 */
export function useBook(): BookState {
  const [state, setState] = useState<BookState>({
    loading: true,
    error: null,
    book: [],
    sourceName: '',
    now: new Date(),
    reasoning: {},
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const provider = resolveBookProvider();
        const { book, now, sourceName, reasoning } = await provider.loadBook();
        if (!cancelled) {
          setState({ loading: false, error: null, book, sourceName, now, reasoning });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load the book of business.',
            book: [],
            sourceName: '',
            now: new Date(),
            reasoning: {},
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
