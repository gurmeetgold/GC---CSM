import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminConsole } from './AdminConsole';

/**
 * Smoke test: every admin tab renders without throwing, given a stubbed backend.
 * Not re-testing server enforcement (that's `roleGating.test.ts` et al.) — this is
 * just "the UI plumbing doesn't crash and calls the right endpoints".
 */
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const ROUTES: Record<string, unknown> = {
  '/api/admin/integrations': { integrations: [
    { kind: 'crm', label: 'CRM (Merge)', powers: 'Powers Portfolio.', status: 'not_connected', lastSyncedAt: null, liveFlowAvailable: true },
  ] },
  '/api/admin/users': { users: [
    { id: 'u1', email: 'a@co.com', name: 'A', role: 'admin', orgId: 'default', createdAt: '2026-01-01T00:00:00Z', lastActiveAt: null },
  ], invites: [] },
  '/api/admin/thresholds': { override: {} },
  '/api/admin/audit-log': { events: [] },
  '/api/admin/org-settings': { settings: {
    orgId: 'default', name: 'My Org', timezone: 'UTC',
    notifyOn: { critical_risk: true, renewal_jeopardy: true, sla_breach: true, new_champion_silence: false },
  } },
};

describe('AdminConsole', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
      const body = ROUTES[path];
      if (body === undefined) return jsonResponse({});
      return jsonResponse(body);
    }));
    // Backend must be "configured" for adminApi to build URLs at all.
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:8787');
  }

  it('renders every tab without crashing', async () => {
    stubFetch();
    render(<AdminConsole />);

    expect(screen.getByText('Admin Console')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('CRM (Merge)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Users & Roles' }));
    await waitFor(() => expect(screen.getByText('a@co.com')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Signal Thresholds' }));
    await waitFor(() => expect(screen.getByText('Usage decline')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Data & Security' }));
    await waitFor(() => expect(screen.getByText('Audit log')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Organization' }));
    await waitFor(() => expect(screen.getByDisplayValue('My Org')).toBeInTheDocument());
  });
});
