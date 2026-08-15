import type { ReactNode } from 'react';
import { useState } from 'react';
import type { SourceConnection } from '../../data';
import {
  IconHome, IconAccounts, IconRenewals, IconOpportunities, IconTech, IconPlaybook,
  IconAlert, IconExec, IconSettings, IconSearch, IconBell, IconCalendar, IconChevron,
} from './icons';

export type Route = 'home' | 'accounts' | 'renewals' | 'opportunities' | 'support' | 'executive' | 'ask';

interface NavItem {
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  route: Route | null; // null = shown but disabled (feature not in this build)
  badge?: number;
}

// The full SignalOS nav is reproduced; items we don't build this phase are shown
// but non-clickable (disabled), so the shell matches the vision without faking depth.
const NAV: NavItem[] = [
  { label: 'Home', icon: IconHome, route: 'home' },
  { label: 'Accounts', icon: IconAccounts, route: 'accounts' },
  { label: 'Renewals', icon: IconRenewals, route: 'renewals' },
  { label: 'Opportunities', icon: IconOpportunities, route: 'opportunities' },
  { label: 'Technical Health', icon: IconTech, route: 'support' },
  { label: 'Playbooks', icon: IconPlaybook, route: null },
  { label: 'Alerts', icon: IconAlert, route: null, badge: 12 },
  { label: 'Executive View', icon: IconExec, route: 'executive' },
  { label: 'Settings', icon: IconSettings, route: null },
];

export interface Snapshot {
  total: number;
  healthy: number;
  atRisk: number;
  critical: number;
}

export function AppShell({
  route,
  onNavigate,
  onAsk,
  snapshot,
  connections = [],
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  onAsk: (q: string) => void;
  snapshot: Snapshot;
  connections?: SourceConnection[];
  children: ReactNode;
}) {
  const [q, setQ] = useState('');
  return (
    <div className="min-h-screen bg-surface-sunken text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white">
        Skip to content
      </a>

      <div className="flex">
        {/* Left nav */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="flex items-center gap-2 px-5 py-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-[#5b8dff] text-sm font-bold text-white">S</span>
            <span className="text-[17px] font-semibold tracking-tight text-ink">SignalOS</span>
          </div>

          <nav className="flex-1 px-3 py-2" aria-label="Primary">
            {NAV.map((item) => {
              const active = item.route === route;
              const disabled = item.route === null;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={disabled}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => item.route && onNavigate(item.route)}
                  className={`group mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-brand-soft text-brand'
                      : disabled
                        ? 'cursor-not-allowed text-ink-faint/60'
                        : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                  }`}
                >
                  <span className={active ? 'text-brand' : ''}><item.icon size={18} /></span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="nums rounded-full bg-risk-redBg px-1.5 py-0.5 text-xs font-semibold text-risk-red">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Portfolio snapshot */}
          <div className="m-3 rounded-xl border border-line bg-surface-sunken p-4">
            <div className="text-xs font-semibold text-ink-soft">Portfolio Snapshot</div>
            <div className="nums mt-1 text-2xl font-semibold text-ink">{snapshot.total}</div>
            <div className="text-xs text-ink-faint">Total Accounts</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              <SnapRow color="bg-risk-green" label="Healthy" value={snapshot.healthy} />
              <SnapRow color="bg-risk-yellow" label="At Risk" value={snapshot.atRisk} />
              <SnapRow color="bg-risk-red" label="Critical" value={snapshot.critical} />
            </ul>
            <button type="button" onClick={() => onNavigate('accounts')} className="mt-3 text-xs font-medium text-brand hover:text-brand-hover">
              View all accounts →
            </button>
          </div>

          {/* Data sources — honest connection status */}
          {connections.length > 0 && (
            <div className="mx-3 mb-3 rounded-xl border border-line bg-surface-sunken p-4">
              <div className="text-xs font-semibold text-ink-soft">Data Sources</div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {connections.map((c) => (
                  <ConnRow key={c.name} conn={c} />
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <form
                className="relative hidden max-w-xl flex-1 sm:block"
                onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim()); }}
              >
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><IconSearch size={16} /></span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search or ask a question about your book"
                  placeholder="Search accounts, stakeholders, alerts, playbooks…  (press Enter to ask)"
                  className="w-full rounded-lg border border-line bg-surface-sunken py-2 pl-9 pr-12 text-sm text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:bg-surface"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">⌘K</kbd>
              </form>
              <div className="flex-1 sm:hidden" />
              <button type="button" className="hidden items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft sm:flex">
                <IconCalendar size={16} /> May 12 – Jun 8, 2025 <IconChevron size={14} />
              </button>
              <button type="button" aria-label="Notifications" className="relative rounded-lg p-2 text-ink-soft hover:bg-surface-sunken">
                <IconBell size={18} />
                <span className="nums absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-risk-red text-[10px] font-semibold text-white">7</span>
              </button>
              <div className="flex items-center gap-2 pl-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">SC</span>
                <div className="hidden leading-tight sm:block">
                  <div className="text-sm font-medium text-ink">Sarah Chen</div>
                  <div className="text-xs text-ink-faint">Senior CSM</div>
                </div>
              </div>
            </div>
            {/* Mobile nav */}
            <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden" aria-label="Primary mobile">
              {NAV.filter((n) => n.route).map((item) => (
                <button key={item.label} type="button" onClick={() => item.route && onNavigate(item.route)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${item.route === route ? 'bg-brand-soft text-brand' : 'text-ink-soft'}`}>
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

const CONN_META: Record<SourceConnection['status'], { color: string; label: string }> = {
  connected: { color: 'bg-risk-green', label: 'Connected' },
  cold_start: { color: 'bg-risk-yellow', label: 'Cold start' },
  not_connected: { color: 'bg-ink-faint/50', label: 'Not connected' },
};

function ConnRow({ conn }: { conn: SourceConnection }) {
  const meta = CONN_META[conn.status];
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-ink-soft">
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.color}`} />
        <span className="truncate">{conn.name}</span>
      </span>
      <span className="shrink-0 text-ink-faint" title={conn.detail}>{meta.label}</span>
    </li>
  );
}

function SnapRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink-soft"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
      <span className="nums font-medium text-ink">{value}</span>
    </li>
  );
}
