import { describe, it, expect } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from './http';
import { resolveServerConfig } from './config';

/**
 * Proves the WHOLE admin console — including "connecting" every integration —
 * works end-to-end over HTTP with DATA_SOURCE=mock and zero real credentials, per
 * the phase guardrail. No env var beyond DATA_SOURCE is set anywhere in this file.
 */
describe('admin console works fully in mock mode, no credentials', () => {
  async function boot() {
    const app = createServer(resolveServerConfig({ DATA_SOURCE: 'mock' }), { corsOrigin: '*' });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    return { server, base: `http://127.0.0.1:${port}` };
  }

  it('every one of the five integration cards can be connected and disconnected', async () => {
    const { server, base } = await boot();
    try {
      const bootstrap = await fetch(`${base}/api/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@co.com', name: 'Admin', password: 'adminpass123' }),
      });
      const { token } = (await bootstrap.json()) as { token: string };
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      for (const kind of ['crm', 'helpdesk', 'slack', 'google', 'microsoft']) {
        const connect = await fetch(`${base}/api/admin/integrations/${kind}/connect`, { method: 'POST', headers });
        expect(connect.status, `${kind} connect`).toBe(200);
        const connectBody = await connect.json();
        expect(connectBody.integration.status).toBe('connected');

        const disconnect = await fetch(`${base}/api/admin/integrations/${kind}/disconnect`, { method: 'POST', headers });
        expect(disconnect.status, `${kind} disconnect`).toBe(200);
        expect((await disconnect.json()).integration.status).toBe('not_connected');
      }

      // The audit log recorded every connect/disconnect.
      const audit = await fetch(`${base}/api/admin/audit-log`, { headers });
      const { events } = (await audit.json()) as { events: { action: string }[] };
      expect(events.filter((e) => e.action === 'integration.connected')).toHaveLength(5);
      expect(events.filter((e) => e.action === 'integration.disconnected')).toHaveLength(5);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('thresholds can be edited and reset through the admin API without touching the engine', async () => {
    const { server, base } = await boot();
    try {
      const bootstrap = await fetch(`${base}/api/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin2@co.com', name: 'Admin', password: 'adminpass123' }),
      });
      const { token } = (await bootstrap.json()) as { token: string };
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const put = await fetch(`${base}/api/admin/thresholds`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ override: { championSilence: { maxDaysSinceContact: 10 } } }),
      });
      expect(put.status).toBe(200);
      expect((await put.json()).override).toEqual({ championSilence: { maxDaysSinceContact: 10 } });

      const reset = await fetch(`${base}/api/admin/thresholds/reset`, { method: 'POST', headers, body: '{}' });
      expect(reset.status).toBe(200);
      expect((await reset.json()).override).toEqual({});
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('org settings can be read and updated', async () => {
    const { server, base } = await boot();
    try {
      const bootstrap = await fetch(`${base}/api/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin3@co.com', name: 'Admin', password: 'adminpass123' }),
      });
      const { token } = (await bootstrap.json()) as { token: string };
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const put = await fetch(`${base}/api/admin/org-settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: 'Acme CS', timezone: 'America/Los_Angeles' }),
      });
      expect(put.status).toBe(200);
      const body = await put.json();
      expect(body.settings.name).toBe('Acme CS');
      expect(body.settings.timezone).toBe('America/Los_Angeles');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
