import { useState } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { IntegrationsPage } from './IntegrationsPage';
import { UsersPage } from './UsersPage';
import { ThresholdsPage } from './ThresholdsPage';
import { DataSecurityPage } from './DataSecurityPage';
import { OrgSettingsPage } from './OrgSettingsPage';

type Tab = 'integrations' | 'users' | 'thresholds' | 'security' | 'org';

const TABS: { id: Tab; label: string }[] = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'thresholds', label: 'Signal Thresholds' },
  { id: 'security', label: 'Data & Security' },
  { id: 'org', label: 'Organization' },
];

/** Admin-only console (Phase 7). Reachable only when `App.tsx` has already verified
 *  `canSeeAdminConsole(user.role)`; every API call underneath is ALSO server-enforced
 *  (`requireRole('admin')` in `server/http.ts`), so this component assumes nothing. */
export function AdminConsole() {
  const [tab, setTab] = useState<Tab>('integrations');

  return (
    <div>
      <PageHeader title="Admin Console" subtitle="Integrations, users & roles, signal thresholds, and data & security posture for your org." />

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'integrations' && <IntegrationsPage />}
      {tab === 'users' && <UsersPage />}
      {tab === 'thresholds' && <ThresholdsPage />}
      {tab === 'security' && <DataSecurityPage />}
      {tab === 'org' && <OrgSettingsPage />}
    </div>
  );
}
