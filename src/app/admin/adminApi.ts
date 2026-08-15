import { authHeaders } from '../../session/clientSession';
import { backendUrl } from '../bookProvider';
import type { Role, ThresholdOverride, User, Invite } from '../../domain';
import type { IntegrationCard, IntegrationKind } from '../../admin/integrationsStore';
import type { AuditEvent } from '../../admin/auditLog';
import type { OrgSettings } from '../../admin/orgSettingsStore';

/**
 * Thin typed client for the `/api/admin/*` surface. Every call carries the session
 * token; the server is the real enforcement point (`requireRole('admin')` — see
 * `server/http.ts`), this is just a convenience wrapper, not a security boundary.
 */

function base(): string {
  const url = backendUrl();
  if (!url) throw new Error('Admin console requires a configured backend.');
  return url.replace(/\/$/, '');
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: authHeaders({ 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  listIntegrations: () => call<{ integrations: IntegrationCard[] }>('/api/admin/integrations'),
  connectIntegration: (kind: IntegrationKind) =>
    call<{ integration: IntegrationCard }>(`/api/admin/integrations/${kind}/connect`, { method: 'POST' }),
  disconnectIntegration: (kind: IntegrationKind) =>
    call<{ integration: IntegrationCard }>(`/api/admin/integrations/${kind}/disconnect`, { method: 'POST' }),

  listUsers: () => call<{ users: User[]; invites: Invite[] }>('/api/admin/users'),
  inviteUser: (email: string, role: Role) =>
    call<{ inviteId: string; emailSent: boolean; emailError?: string }>(
      '/api/admin/users/invite', { method: 'POST', body: JSON.stringify({ email, role }) },
    ),
  resendInvite: (inviteId: string) =>
    call<{ inviteId: string; emailSent: boolean; emailError?: string }>(
      `/api/admin/users/invite/${inviteId}/resend`, { method: 'POST' },
    ),
  setUserRole: (id: string, role: Role) =>
    call<{ user: User }>(`/api/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setManagedCsmNames: (id: string, managedCsmNames: string[]) =>
    call<{ user: User }>(`/api/admin/users/${id}/managed-csms`, { method: 'PATCH', body: JSON.stringify({ managedCsmNames }) }),

  getThresholds: () => call<{ override: ThresholdOverride }>('/api/admin/thresholds'),
  setThresholds: (override: ThresholdOverride) =>
    call<{ override: ThresholdOverride }>('/api/admin/thresholds', { method: 'PUT', body: JSON.stringify({ override }) }),
  resetThreshold: (key?: keyof ThresholdOverride) =>
    call<{ override: ThresholdOverride }>('/api/admin/thresholds/reset', { method: 'POST', body: JSON.stringify({ key }) }),

  listAuditLog: () => call<{ events: AuditEvent[] }>('/api/admin/audit-log'),

  getOrgSettings: () => call<{ settings: OrgSettings }>('/api/admin/org-settings'),
  updateOrgSettings: (patch: Partial<Omit<OrgSettings, 'orgId'>>) =>
    call<{ settings: OrgSettings }>('/api/admin/org-settings', { method: 'PUT', body: JSON.stringify(patch) }),
};
