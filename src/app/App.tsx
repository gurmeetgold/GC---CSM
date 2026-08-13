import { useMemo, useState } from 'react';
import { useBook } from './useBook';
import { HealthOverview } from './screens/HealthOverview';
import { RedAccounts } from './screens/RedAccounts';
import { AskAnything } from './screens/AskAnything';
import { createAnswerEngine } from '../answer';
import { HttpAnswerEngine } from '../answer/http/HttpAnswerEngine';
import { backendUrl } from './bookProvider';

type Tab = 'overview' | 'red' | 'ask';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Health overview' },
  { key: 'red', label: 'At-risk accounts' },
  { key: 'ask', label: 'Ask anything' },
];

export default function App() {
  const { loading, error, book, now, reasoning } = useBook();
  const [tab, setTab] = useState<Tab>('overview');
  const [focusId, setFocusId] = useState<string | null>(null);
  // Backend present → route answers through it (real Claude); otherwise the mock.
  const answerEngine = useMemo(() => {
    const url = backendUrl();
    return url ? new HttpAnswerEngine(url) : createAnswerEngine('mock');
  }, []);

  // Navigating to an account jumps to the reasoning screen and highlights it.
  function selectAccount(id: string) {
    setFocusId(id);
    setTab('red');
  }

  const redCount = book.filter((e) => e.evaluation.riskLevel === 'red').length;

  return (
    <div className="min-h-screen bg-surface-sunken">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
              CS
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-ink">Customer Success Copilot</h1>
              <p className="text-xs text-ink-faint">Your book of business, at a glance</p>
            </div>
          </div>

          <nav className="mt-4 flex gap-1" aria-label="Primary">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    if (t.key !== 'red') setFocusId(null);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-surface-sunken text-ink' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {t.label}
                  {t.key === 'red' && redCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-risk-redBg px-1.5 py-0.5 text-xs font-semibold text-risk-red">
                      {redCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && <LoadingState />}
        {error && !loading && <ErrorState message={error} />}
        {!loading && !error && (
          <>
            {tab === 'overview' && <HealthOverview book={book} now={now} onSelect={selectAccount} />}
            {tab === 'red' && <RedAccounts book={book} focusId={focusId} reasoning={reasoning} />}
            {tab === 'ask' && <AskAnything book={book} onSelect={selectAccount} engine={answerEngine} />}
          </>
        )}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
      <span className="sr-only">Loading your book of business…</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-risk-red/40 bg-risk-redBg p-6" role="alert">
      <h2 className="font-semibold text-risk-red">Couldn’t load the book</h2>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
    </div>
  );
}
