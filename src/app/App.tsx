import { useMemo, useState } from 'react';
import { useBook } from './useBook';
import { AppShell, type Route } from './ui/AppShell';
import { Home } from './screens/Home';
import { AccountsScreen } from './screens/AccountsScreen';
import { AccountDetail } from './screens/AccountDetail';
import { RenewalsCenter } from './screens/RenewalsCenter';
import { OpportunitiesScreen } from './screens/OpportunitiesScreen';
import { SupportScreen } from './screens/SupportScreen';
import { Executive } from './screens/Executive';
import { AskAnything } from './screens/AskAnything';
import { createAnswerEngine } from '../answer';
import { HttpAnswerEngine } from '../answer/http/HttpAnswerEngine';
import { backendUrl } from './bookProvider';

export default function App() {
  const { loading, error, book, now, reasoning } = useBook();
  const [route, setRoute] = useState<Route>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askSeed, setAskSeed] = useState('');

  const answerEngine = useMemo(() => {
    const url = backendUrl();
    return url ? new HttpAnswerEngine(url) : createAnswerEngine('mock');
  }, []);

  const snapshot = useMemo(() => {
    const s = { total: book.length, healthy: 0, atRisk: 0, critical: 0 };
    for (const e of book) {
      if (e.evaluation.riskLevel === 'green') s.healthy++;
      else if (e.evaluation.riskLevel === 'yellow') s.atRisk++;
      else s.critical++;
    }
    return s;
  }, [book]);

  function navigate(r: Route) {
    setRoute(r);
    setSelectedId(null);
  }
  function selectAccount(id: string) {
    setSelectedId(id);
    setRoute('accounts');
  }
  function ask(q: string) {
    setAskSeed(q);
    setRoute('ask');
    setSelectedId(null);
  }

  const selected = selectedId ? book.find((e) => e.account.id === selectedId) ?? null : null;

  return (
    <AppShell route={route} onNavigate={navigate} onAsk={ask} snapshot={snapshot}>
      {loading && <LoadingState />}
      {error && !loading && <ErrorState message={error} />}
      {!loading && !error && (
        <>
          {route === 'home' && <Home book={book} now={now} onSelect={selectAccount} onAsk={ask} onNavigate={navigate} />}
          {route === 'accounts' && !selected && <AccountsScreen book={book} now={now} reasoning={reasoning} onSelect={selectAccount} />}
          {route === 'accounts' && selected && (
            <AccountDetail e={selected} now={now} reasoning={reasoning[selected.account.id]} onBack={() => setSelectedId(null)} />
          )}
          {route === 'renewals' && <RenewalsCenter book={book} now={now} onSelect={selectAccount} />}
          {route === 'opportunities' && <OpportunitiesScreen book={book} onSelect={selectAccount} />}
          {route === 'support' && <SupportScreen book={book} now={now} onSelect={selectAccount} />}
          {route === 'executive' && <Executive book={book} now={now} />}
          {route === 'ask' && <AskAnything book={book} onSelect={selectAccount} engine={answerEngine} seed={askSeed} />}
        </>
      )}
    </AppShell>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface" />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-surface" />)}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-line bg-surface" />
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
