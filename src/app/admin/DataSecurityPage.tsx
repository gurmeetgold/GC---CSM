import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { adminApi } from './adminApi';
import type { AuditEvent } from '../../admin/auditLog';
import type { IntegrationCard } from '../../admin/integrationsStore';

/** Plain-language summary — mirrors DATA_HANDLING.md so the console tells the same
 *  story as the doc, not a different one. Kept as static content per the phase brief
 *  ("data retention statement can be a static paragraph"), not generated. */
const STORAGE_SUMMARY: { integration: string; stored: string; passThrough: string; scopes: string }[] = [
  { integration: 'CRM (Merge)', stored: 'Nothing raw — normalized Account fields only, in memory for the request.', passThrough: 'Salesforce/HubSpot records, mapped then discarded.', scopes: 'Read: accounts, contacts, opportunities.' },
  { integration: 'Help Desk (Merge)', stored: 'Nothing raw — ticket counts + derived SLA status only.', passThrough: 'Raw ticket text, mapped then discarded (tone is never inferred from it).', scopes: 'Read: tickets.' },
  { integration: 'Slack', stored: 'Nothing — not built yet (see SETUP_SLACK.md).', passThrough: 'N/A', scopes: 'N/A' },
  { integration: 'Google Workspace', stored: 'Nothing — not built yet.', passThrough: 'N/A', scopes: 'N/A' },
  { integration: 'Microsoft 365', stored: 'Nothing — not built yet.', passThrough: 'N/A', scopes: 'N/A' },
];

export function DataSecurityPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationCard[] | null>(null);

  useEffect(() => {
    void adminApi.listAuditLog().then((r) => setEvents(r.events));
    void adminApi.listIntegrations().then((r) => setIntegrations(r.integrations));
  }, []);

  return (
    <div className="space-y-4">
      <Card title="What's stored vs. pass-through" subtitle="Per DATA_HANDLING.md — nothing here is generated per view; it's the same story as the doc.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2">Integration</th>
                <th className="px-5 py-2">Stored</th>
                <th className="px-5 py-2">Pass-through</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE_SUMMARY.map((row) => (
                <tr key={row.integration} className="border-t border-line align-top">
                  <td className="px-5 py-2.5 font-medium text-ink">{row.integration}</td>
                  <td className="px-5 py-2.5 text-ink-soft">{row.stored}</td>
                  <td className="px-5 py-2.5 text-ink-soft">{row.passThrough}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Granted scopes" subtitle="What each connected integration was authorized to read. Revoke via the provider — we never store more than these scopes ask for.">
        <ul className="space-y-2 px-5 pb-5 text-sm">
          {STORAGE_SUMMARY.map((row) => {
            const card = integrations?.find((i) => i.label === row.integration);
            return (
              <li key={row.integration} className="flex items-center justify-between border-t border-line pt-2 first:border-t-0 first:pt-0">
                <span>
                  <span className="font-medium text-ink">{row.integration}</span>
                  <span className="ml-2 text-ink-soft">{row.scopes}</span>
                </span>
                {card?.status === 'connected' && (
                  <span className="text-xs font-medium text-ink-faint">Revoke access in the provider's app settings</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Audit log" subtitle="Who connected/disconnected an integration or changed a role, and when. Not exhaustive yet.">
        {!events ? (
          <p className="px-5 pb-5 text-sm text-ink-soft">Loading…</p>
        ) : events.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-soft">No audit events yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-ink">{e.actorEmail}</span>{' '}
                  <span className="text-ink-soft">{describeAction(e.action)}</span>{' '}
                  <span className="font-medium text-ink">{e.target}</span>
                </span>
                <span className="text-xs text-ink-faint">{new Date(e.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Data retention">
        <p className="px-5 pb-5 text-sm text-ink-soft">
          We do not persist raw customer records from any connected integration. CRM and help-desk data are fetched,
          normalized into the fields SignalOS displays, held in memory for the evaluation, and discarded — nothing is
          written to a database in this phase. Integration credentials (account tokens) are the one thing we do store,
          encrypted at rest (AES-256-GCM), so the connection survives a restart without re-authorizing. See
          <span className="font-medium text-ink"> DATA_HANDLING.md</span> for the full accounting.
        </p>
      </Card>
    </div>
  );
}

function describeAction(action: AuditEvent['action']): string {
  switch (action) {
    case 'integration.connected': return 'connected';
    case 'integration.disconnected': return 'disconnected';
    case 'role.changed': return 'changed role for';
    case 'user.invited': return 'invited';
    case 'threshold.changed': return 'changed threshold(s)';
    case 'threshold.reset': return 'reset threshold(s)';
    default: return action;
  }
}
