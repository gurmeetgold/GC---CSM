import { useEffect, useMemo, useState } from 'react';
import { useBook } from './useBook';
import { AppShell, type Route, type CurrentUserInfo } from './ui/AppShell';
import { Home } from './screens/Home';
import { AccountsScreen } from './screens/AccountsScreen';
import { AccountDetail } from './screens/AccountDetail';
import { RenewalsCenter } from './screens/RenewalsCenter';
import { OpportunitiesScreen } from './screens/OpportunitiesScreen';
import { SupportScreen } from './screens/SupportScreen';
import { Executive } from './screens/Executive';
import { AskAnything } from './screens/AskAnything';
import { AdminConsole } from './admin/AdminConsole';
import { createAnswerEngine } from '../answer';
import { HttpAnswerEngine } from '../answer/http/HttpAnswerEngine';
import { backendUrl } from './bookProvider';
import { AuthProvider, useAuth, canSeeExecutiveView, canSeeAdminConsole } from './auth/AuthContext';
import { LoginScreen } from './auth/LoginScreen';
import { AcceptInviteScreen } from './auth/AcceptInviteScreen';
import type { Role } from '../domain';

export default function App() {
  return (
    <AuthProvider baseUrl={backendUrl()}>
      <Router />
    </AuthProvider>
  );
}

/**
 * No router library — this app has one public route worth a real URL
 * (`/invite/:token`, reachable while signed out) and otherwise navigates via
 * in-memory state (unchanged since Phase 1). A signed-in user hitting a stale
 * invite link just sees the normal app; the invite screen is for new users only.
 */
function Router() {
  const { status } = useAuth();
  const [path, setPath] = useState(() => window.location.pathname);
  const inviteToken = path.match(/^\/invite\/([^/]+)\/?$/)?.[1];

  useEffect(() => {
    // Once acceptance flips us to signed-in, drop the /invite/:token URL so a
    // refresh (or the back button) doesn't re-show the accept screen.
    if (inviteToken && status === 'signed-in') {
      window.history.replaceState({}, '', '/');
      setPath('/');
    }
  }, [inviteToken, status]);

  if (inviteToken && status !== 'signed-in') {
    return <AcceptInviteScreen token={inviteToken} onGoToLogin={() => { window.history.replaceState({}, '', '/'); setPath('/'); }} />;
  }
  return <AuthGate />;
}

/**
 * Blocks the whole app behind login ONLY when a backend is configured — the
 * zero-credential local demo (no `VITE_BACKEND_URL`) is unchanged from before
 * Phase 7: no login, no roles, no admin console (see DECISIONS.md #34).
 */
function AuthGate() {
  const { status, authEnabled } = useAuth();
  if (!authEnabled) return <AppContent />;
  if (status === 'loading') return <FullScreenLoading />;
  if (status === 'needs-bootstrap' || status === 'signed-out') return <LoginScreen />;
  return <AppContent />;
}

/** CSM/manager land on Portfolio; exec lands on Executive View; admin lands on the
 *  console they were invited to run. Pre-auth demo (no user) always starts at Home. */
function landingRoute(role: Role | undefined): Route {
  if (role === 'exec') return 'executive';
  if (role === 'admin') return 'admin';
  return 'home';
}

function AppContent() {
  const { loading, error, book, now, reasoning, connections } = useBook();
  const { user, authEnabled, logout } = useAuth();
  const [route, setRoute] = useState<Route>(() => landingRoute(user?.role));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askSeed, setAskSeed] = useState('');

  // Pre-auth demo (no backend): everyone sees Executive View, nobody sees Admin
  // Console (there's no server to enforce it against). Authenticated deployments
  // gate both by role — see DECISIONS.md #34.
  const showExecutive = !authEnabled || canSeeExecutiveView(user?.role);
  const showAdmin = authEnabled && canSeeAdminConsole(user?.role);

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

  const currentUser: CurrentUserInfo | undefined = user
    ? { name: user.name, roleLabel: roleLabel(user.role), initials: initials(user.name) }
    : undefined;

  return (
    <AppShell
      route={route}
      onNavigate={navigate}
      onAsk={ask}
      snapshot={snapshot}
      connections={connections}
      showExecutive={showExecutive}
      showAdmin={showAdmin}
      currentUser={currentUser}
      onLogout={authEnabled ? () => void logout() : undefined}
    >
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
          {route === 'executive' && (showExecutive ? <Executive book={book} now={now} /> : <ForbiddenState what="Executive View" />)}
          {route === 'ask' && <AskAnything book={book} onSelect={selectAccount} engine={answerEngine} seed={askSeed} />}
          {route === 'admin' && (showAdmin ? <AdminConsole /> : <ForbiddenState what="Admin Console" />)}
        </>
      )}
    </AppShell>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin';
    case 'exec': return 'Executive';
    case 'manager': return 'Manager';
    default: return 'CSM';
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
      <div className="h-8 w-8 animate-pulse rounded-full bg-brand-soft" />
    </div>
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

/** Client-side belt-and-suspenders: even if route state is somehow forced to a
 *  gated route, render nothing instead of the screen. The real enforcement is
 *  server-side (see http.ts's requireRole on /api/leadership and /api/admin/*). */
function ForbiddenState({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6" role="alert">
      <h2 className="font-semibold text-ink">You don’t have access to {what}</h2>
      <p className="mt-1 text-sm text-ink-soft">Ask an admin if you believe this is wrong.</p>
    </div>
  );
}
