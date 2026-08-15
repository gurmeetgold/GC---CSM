import { describe, it, expect } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from './http';
import { resolveServerConfig } from './config';

/**
 * SERVER-SIDE role-gating proof, exercised over real HTTP against the real Express
 * app (mock config, zero credentials) — not just "the nav link is hidden". A
 * determined user hitting these URLs directly with the wrong role, or no session at
 * all, must be blocked by the server itself.
 *
 * Each test boots its OWN server instance (this deployment is single-org, so the
 * first-admin bootstrap can only run once per org — a shared server across tests
 * would make every test after the first fail to bootstrap).
 */
async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = createServer(resolveServerConfig({ DATA_SOURCE: 'mock' }), { corsOrigin: '*' });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function bootstrapAdmin(base: string, email = 'owner@co.com') {
  const res = await fetch(`${base}/api/auth/bootstrap-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Admin', password: 'adminpass123' }),
  });
  return (await res.json()) as { token: string; user: { id: string } };
}

/** Invites, then reads the invite's secret token back via the admin-only users list
 *  (the invite-creation response deliberately does NOT return the token — see
 *  DECISIONS.md's Phase 8 entry — so a real client only ever gets it via the email). */
async function inviteAndGetToken(base: string, adminToken: string, email: string, role: string): Promise<string> {
  await fetch(`${base}/api/admin/users/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email, role }),
  });
  const usersRes = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const { invites } = (await usersRes.json()) as { invites: { email: string; token: string }[] };
  return invites.find((i) => i.email === email)!.token;
}

async function acceptInvite(base: string, token: string, name: string) {
  const res = await fetch(`${base}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name, password: 'userpass123' }),
  });
  return (await res.json()) as { token: string; user: { role: string } };
}

describe('role gating over HTTP', () => {
  it('bootstrap-admin only works once (first-run), then refuses', async () => {
    await withServer(async (base) => {
      const first = await bootstrapAdmin(base, 'owner-a@co.com');
      expect(first.user).toBeTruthy();
      const second = await fetch(`${base}/api/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'someone-else@co.com', name: 'X', password: 'whatever123' }),
      });
      expect(second.status).toBe(409);
    });
  });

  it('GET /api/leadership: 401 with no session at all', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/leadership`);
      expect(res.status).toBe(401);
    });
  });

  it('GET /api/leadership: a csm user is blocked by ANY path (exec-gating, explicit)', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const inviteToken = await inviteAndGetToken(base, admin.token, 'csm-1@co.com', 'csm');
      const csm = await acceptInvite(base, inviteToken, 'CSM One');
      expect(csm.user.role).toBe('csm');

      const res = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${csm.token}` } });
      expect(res.status).toBe(403);
    });
  });

  it('GET /api/leadership: a manager user is also blocked', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const inviteToken = await inviteAndGetToken(base, admin.token, 'mgr-1@co.com', 'manager');
      const manager = await acceptInvite(base, inviteToken, 'Manager One');

      const res = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${manager.token}` } });
      expect(res.status).toBe(403);
    });
  });

  it('GET /api/leadership: an exec user CAN reach it', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const inviteToken = await inviteAndGetToken(base, admin.token, 'exec-1@co.com', 'exec');
      const exec = await acceptInvite(base, inviteToken, 'Exec One');

      const res = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${exec.token}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snapshot).toBeTruthy();
    });
  });

  it('GET /api/leadership: an admin user CAN reach it too', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const res = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${admin.token}` } });
      expect(res.status).toBe(200);
    });
  });

  it('/api/admin/*: 401 with no session', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/admin/integrations`);
      expect(res.status).toBe(401);
    });
  });

  it('/api/admin/*: csm, manager, AND exec are all blocked — admin only', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      for (const role of ['csm', 'manager', 'exec'] as const) {
        const inviteToken = await inviteAndGetToken(base, admin.token, `${role}-blocked@co.com`, role);
        const user = await acceptInvite(base, inviteToken, `${role} blocked`);
        const res = await fetch(`${base}/api/admin/integrations`, { headers: { Authorization: `Bearer ${user.token}` } });
        expect(res.status, `role ${role} should be blocked from /api/admin/*`).toBe(403);
      }
    });
  });

  it('/api/admin/*: an admin CAN reach every sub-page', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const headers = { Authorization: `Bearer ${admin.token}` };
      for (const path of ['/api/admin/integrations', '/api/admin/users', '/api/admin/thresholds', '/api/admin/audit-log', '/api/admin/org-settings']) {
        const res = await fetch(`${base}${path}`, { headers });
        expect(res.status, `admin should reach ${path}`).toBe(200);
      }
    });
  });

  it('an expired/garbage token is treated as unauthenticated, not crashing the server', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/leadership`, { headers: { Authorization: 'Bearer not-a-real-token' } });
      expect(res.status).toBe(401);
    });
  });

  it('GET /api/accounts stays open with no session (backward-compatible demo path)', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/accounts`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accounts.length).toBeGreaterThan(0);
    });
  });

  it('GET /api/accounts scopes to a csm’s own book when authenticated', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const inviteToken = await inviteAndGetToken(base, admin.token, 'scope-csm@co.com', 'csm');
      const csm = await acceptInvite(base, inviteToken, 'Maya Chen'); // matches a mock ownerCsm name

      const res = await fetch(`${base}/api/accounts`, { headers: { Authorization: `Bearer ${csm.token}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accounts.length).toBeGreaterThan(0);
      expect(body.accounts.every((e: { account: { ownerCsm: string } }) => e.account.ownerCsm === 'Maya Chen')).toBe(true);
    });
  });
});
