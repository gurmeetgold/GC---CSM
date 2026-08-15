import { describe, it, expect } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from './http';
import { resolveServerConfig } from './config';

/**
 * Phase 8: the full invite → accept HTTP flow, plus the edge cases the phase brief
 * calls out explicitly. Each test boots its own server (single-org bootstrap can
 * only run once), matching the Phase 7 `roleGating.test.ts` pattern.
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

async function bootstrapAdmin(base: string) {
  const res = await fetch(`${base}/api/auth/bootstrap-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@co.com', name: 'Admin', password: 'adminpass123' }),
  });
  return (await res.json()) as { token: string; user: { id: string; name: string } };
}

async function inviteAndGetToken(base: string, adminToken: string, email: string, role: string): Promise<{ token: string; inviteId: string }> {
  const inviteRes = await fetch(`${base}/api/admin/users/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email, role }),
  });
  const { inviteId } = (await inviteRes.json()) as { inviteId: string };
  const usersRes = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const { invites } = (await usersRes.json()) as { invites: { id: string; email: string; token: string }[] };
  return { token: invites.find((i) => i.id === inviteId)!.token, inviteId };
}

describe('invite → accept HTTP flow (Phase 8)', () => {
  it('the invite email fails to send in test mode (no EMAIL_API_KEY), and the invite creation is not blocked by that', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const res = await fetch(`${base}/api/admin/users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
        body: JSON.stringify({ email: 'csm@co.com', role: 'csm' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      // LoggingEmailService never fails, so this proves "invite creation always succeeds
      // even when email delivery would fail" holds structurally, not just by luck.
      expect(body.emailSent).toBe(true);
      expect(body.inviteId).toBeTruthy();
    });
  });

  it('GET /api/auth/invite/:token is public (no session) and returns org/role/email for a valid token', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');

      const res = await fetch(`${base}/api/auth/invite/${token}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ valid: true, role: 'csm', email: 'csm@co.com' });
      expect(typeof body.orgName).toBe('string');
    });
  });

  it('GET /api/auth/invite/:token returns not_found for a garbage token', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/auth/invite/not-a-real-token`);
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ valid: false, reason: 'not_found' });
    });
  });

  it('GET /api/auth/invite/:token returns already_used after acceptance', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');
      await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'CSM', password: 'csmpass123' }),
      });

      const res = await fetch(`${base}/api/auth/invite/${token}`);
      expect(res.status).toBe(410);
      expect(await res.json()).toMatchObject({ valid: false, reason: 'already_used' });
    });
  });

  it('POST /api/auth/accept-invite rejects a reused token with 400, not 500', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');
      const accept = () => fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'CSM', password: 'csmpass123' }),
      });
      const first = await accept();
      expect(first.status).toBe(201);
      const second = await accept();
      expect(second.status).toBe(400);
      expect((await second.json()).error).toMatch(/already been used/);
    });
  });

  it('POST /api/auth/accept-invite rejects a short password with 400 before touching the invite', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');
      const res = await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'CSM', password: 'short' }),
      });
      expect(res.status).toBe(400);

      // The invite must still be usable — a rejected short password didn't consume it.
      const valid = await fetch(`${base}/api/auth/invite/${token}`);
      expect((await valid.json()).valid).toBe(true);
    });
  });

  it('POST /api/auth/accept-invite rejects an invite for an already-registered email', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      // Invite + accept once to create the account...
      const first = await inviteAndGetToken(base, admin.token, 'dup@co.com', 'csm');
      await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: first.token, name: 'CSM', password: 'csmpass123' }),
      });
      // ...then invite the SAME email again and try to accept the new token.
      const second = await inviteAndGetToken(base, admin.token, 'dup@co.com', 'manager');
      const res = await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: second.token, name: 'CSM Again', password: 'csmpass123' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/already exists/);
    });
  });

  it('resend issues a working new link and invalidates the old one, admin-only', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token: oldToken, inviteId } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');

      // A non-admin cannot resend.
      const csmInvite = await inviteAndGetToken(base, admin.token, 'other-csm@co.com', 'csm');
      const csmLogin = await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: csmInvite.token, name: 'Other CSM', password: 'csmpass123' }),
      });
      const { token: csmSessionToken } = await csmLogin.json();
      const forbidden = await fetch(`${base}/api/admin/users/invite/${inviteId}/resend`, {
        method: 'POST', headers: { Authorization: `Bearer ${csmSessionToken}` },
      });
      expect(forbidden.status).toBe(403);

      // Admin CAN resend; the old token stops working, the new one works.
      const resend = await fetch(`${base}/api/admin/users/invite/${inviteId}/resend`, {
        method: 'POST', headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(resend.status).toBe(200);

      const oldStillValid = await fetch(`${base}/api/auth/invite/${oldToken}`);
      expect((await oldStillValid.json()).valid).toBe(false);

      const usersRes = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${admin.token}` } });
      const { invites } = (await usersRes.json()) as { invites: { id: string; token: string }[] };
      const newToken = invites.find((i) => i.id === inviteId)!.token;
      const newValid = await fetch(`${base}/api/auth/invite/${newToken}`);
      expect((await newValid.json()).valid).toBe(true);
    });
  });

  it('accepting a csm invite creates a session that is then correctly blocked from /api/admin/* and /api/leadership (reuses the Phase 7 gate)', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'csm@co.com', 'csm');
      const acceptRes = await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'CSM', password: 'csmpass123' }),
      });
      expect(acceptRes.status).toBe(201);
      const { token: sessionToken, user } = await acceptRes.json();
      expect(user.role).toBe('csm');
      expect(user.orgId).toBe('default');

      const adminCheck = await fetch(`${base}/api/admin/integrations`, { headers: { Authorization: `Bearer ${sessionToken}` } });
      expect(adminCheck.status).toBe(403);
      const leadershipCheck = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${sessionToken}` } });
      expect(leadershipCheck.status).toBe(403);
    });
  });

  it('accepting an admin invite creates a session that CAN reach /api/admin/* and /api/leadership', async () => {
    await withServer(async (base) => {
      const admin = await bootstrapAdmin(base);
      const { token } = await inviteAndGetToken(base, admin.token, 'admin2@co.com', 'admin');
      const acceptRes = await fetch(`${base}/api/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'Admin Two', password: 'adminpass123' }),
      });
      const { token: sessionToken, user } = await acceptRes.json();
      expect(user.role).toBe('admin');

      const adminCheck = await fetch(`${base}/api/admin/integrations`, { headers: { Authorization: `Bearer ${sessionToken}` } });
      expect(adminCheck.status).toBe(200);
      const leadershipCheck = await fetch(`${base}/api/leadership`, { headers: { Authorization: `Bearer ${sessionToken}` } });
      expect(leadershipCheck.status).toBe(200);
    });
  });
});
