import express, { type Express, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { BookService } from './service';
import type { ServerConfig } from './config';
import { buildAdminServices } from './adminServices';
import { attachUser, requireAuth, requireRole } from './authMiddleware';
import { scopeBookForUser } from './bookScope';
import { DEFAULT_ORG_ID } from './orgId';
import { leadershipSnapshot } from '../leadership/metrics';
import { AuthError } from '../auth/authService';
import type { AdminServices } from './adminServices';
import type { IntegrationKind } from '../admin/integrationsStore';
import type { Invite, ThresholdOverride } from '../domain';

/**
 * The thin backend host. Exposes the evaluated book, ask, and — as of Phase 7 —
 * auth + the admin console API over HTTP.
 *
 * Auth posture (see DECISIONS.md #34 for the full rationale):
 *   - `GET /api/accounts` / `POST /api/ask` stay unauthenticated-callable (backward
 *     compatible with the zero-login demo every prior phase relied on), but apply
 *     role-based book scoping WHEN a valid session is presented.
 *   - `GET /api/leadership` (Executive View's data) and every `/api/admin/*` route
 *     are HARD-gated server-side — the exact two surfaces the phase brief calls out
 *     as "must not be reachable by a determined user typing the URL" — regardless of
 *     what the SPA hides.
 */

export interface HttpServerOptions {
  /** Allowed CORS origin for the dev frontend (e.g. http://localhost:5173). */
  corsOrigin?: string;
  /** Optional path to the built SPA (dist) to serve as static files. */
  staticDir?: string;
}

const ORG = DEFAULT_ORG_ID;

export function createServer(cfg: ServerConfig, opts: HttpServerOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    const origin = opts.corsOrigin ?? '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const admin = buildAdminServices(cfg);
  const service = new BookService(cfg, 60_000, Date.now, admin.thresholds, ORG);
  app.use(attachUser(admin.auth));

  // ---- Health -------------------------------------------------------------

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ...service.describe() });
  });

  // ---- Auth -----------------------------------------------------------------

  app.post('/api/auth/bootstrap-admin', async (req: Request, res: Response) => {
    const { email, name, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'email, name, and a password of at least 8 characters are required.' });
      return;
    }
    try {
      const user = await admin.auth.bootstrapFirstAdmin(ORG, { email, name, password });
      const { user: loggedIn, session } = await admin.auth.login(ORG, email, password);
      res.status(201).json({ token: session.token, user: publicUser(loggedIn ?? user) });
    } catch (err) {
      res.status(err instanceof AuthError ? 409 : 500).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'email and password are required.' });
      return;
    }
    try {
      const { user, session } = await admin.auth.login(ORG, email, password);
      res.json({ token: session.token, user: publicUser(user) });
    } catch {
      res.status(401).json({ error: 'Invalid email or password.' });
    }
  });

  app.post('/api/auth/logout', requireAuth(), async (req: Request, res: Response) => {
    const header = req.header('authorization') ?? '';
    const token = header.split(' ')[1];
    if (token) await admin.auth.logout(token);
    res.status(204).end();
  });

  app.get('/api/auth/me', requireAuth(), (req: Request, res: Response) => {
    res.json({ user: publicUser(req.user!) });
  });

  app.get('/api/auth/org-status', async (_req: Request, res: Response) => {
    res.json({ hasAdmin: (await admin.users.count(ORG)) > 0 });
  });

  // Public: lets the accept-invite screen show "you're invited to <org> as <role>"
  // BEFORE asking for a password, and distinguishes expired / already-used / already-
  // registered so the UI can show the right message instead of one generic error.
  app.get('/api/auth/invite/:token', async (req: Request, res: Response) => {
    const validation = await admin.auth.validateInviteToken(req.params.token ?? '');
    if (!validation.ok) {
      res.status(410).json({ valid: false, reason: validation.reason });
      return;
    }
    const orgSettings = await admin.orgSettings.get(ORG);
    res.json({ valid: true, orgName: orgSettings.name, role: validation.invite.role, email: validation.invite.email });
  });

  app.post('/api/auth/accept-invite', async (req: Request, res: Response) => {
    const { token, name, password } = req.body ?? {};
    if (typeof token !== 'string' || typeof name !== 'string' || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'token, name, and a password of at least 8 characters are required.' });
      return;
    }
    try {
      const user = await admin.auth.acceptInvite(token, { name, password });
      const { session } = await admin.auth.login(user.orgId, user.email, password);
      res.status(201).json({ token: session.token, user: publicUser(user) });
    } catch (err) {
      res.status(err instanceof AuthError ? 400 : 500).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  // ---- Book / ask (open, with optional role-scoping when authenticated) -----

  app.get('/api/accounts', async (req: Request, res: Response) => {
    try {
      const payload = await service.getBook();
      if (!req.user) {
        res.json(payload);
        return;
      }
      res.json({ ...payload, accounts: scopeBookForUser(payload.accounts, req.user) });
    } catch (err) {
      res.status(502).json({ error: 'Failed to load the book', detail: String(err) });
    }
  });

  app.post('/api/ask', async (req: Request, res: Response) => {
    const question = typeof req.body?.question === 'string' ? req.body.question : '';
    try {
      res.json(await service.ask(question));
    } catch (err) {
      res.status(502).json({ error: 'Failed to answer', detail: String(err) });
    }
  });

  // ---- Executive View data — HARD gated: exec or admin only, server-side ----

  app.get('/api/leadership', requireRole('exec', 'admin'), async (_req: Request, res: Response) => {
    try {
      const payload = await service.getBook();
      res.json({ now: payload.now, snapshot: leadershipSnapshot(payload.accounts, new Date(payload.now)) });
    } catch (err) {
      res.status(502).json({ error: 'Failed to compute leadership metrics', detail: String(err) });
    }
  });

  // ---- Admin console — HARD gated: admin only, server-side ------------------

  const adminRouter = express.Router();
  adminRouter.use(requireRole('admin'));

  adminRouter.get('/integrations', async (_req: Request, res: Response) => {
    res.json({ integrations: await admin.integrations.list(ORG) });
  });

  adminRouter.post('/integrations/:kind/connect', async (req: Request, res: Response) => {
    const kind = req.params.kind as IntegrationKind;
    try {
      const card = await admin.integrations.connect(ORG, kind);
      await admin.auditLog.record({
        orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
        action: 'integration.connected', target: kind,
      });
      res.json({ integration: card });
    } catch (err) {
      res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  adminRouter.post('/integrations/:kind/disconnect', async (req: Request, res: Response) => {
    const kind = req.params.kind as IntegrationKind;
    const card = await admin.integrations.disconnect(ORG, kind);
    await admin.auditLog.record({
      orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
      action: 'integration.disconnected', target: kind,
    });
    res.json({ integration: card });
  });

  adminRouter.get('/users', async (_req: Request, res: Response) => {
    const users = await admin.users.list(ORG);
    const invites = await admin.invites.list(ORG);
    res.json({ users: users.map(publicUser), invites });
  });

  adminRouter.post('/users/invite', async (req: Request, res: Response) => {
    const { email, role } = req.body ?? {};
    if (typeof email !== 'string' || !isRole(role)) {
      res.status(400).json({ error: 'email and a valid role are required.' });
      return;
    }
    const invite = await admin.auth.inviteUser(ORG, req.user!.id, { email, role });
    await admin.auditLog.record({
      orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
      action: 'user.invited', target: email,
    });
    const emailResult = await sendInviteEmail(admin, cfg, invite, req.user!.name);
    res.status(201).json({ inviteId: invite.id, emailSent: emailResult.sent, emailError: emailResult.error });
  });

  adminRouter.post('/users/invite/:id/resend', async (req: Request, res: Response) => {
    try {
      const invite = await admin.auth.resendInvite(ORG, req.params.id ?? '');
      const emailResult = await sendInviteEmail(admin, cfg, invite, req.user!.name);
      res.json({ inviteId: invite.id, emailSent: emailResult.sent, emailError: emailResult.error });
    } catch (err) {
      res.status(err instanceof AuthError ? 404 : 500).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  adminRouter.patch('/users/:id/role', async (req: Request, res: Response) => {
    const { role } = req.body ?? {};
    if (!isRole(role)) {
      res.status(400).json({ error: 'a valid role is required.' });
      return;
    }
    const updated = await admin.users.setRole(ORG, req.params.id ?? '', role);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await admin.auditLog.record({
      orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
      action: 'role.changed', target: `${updated.email} -> ${role}`,
    });
    res.json({ user: publicUser(updated) });
  });

  adminRouter.patch('/users/:id/managed-csms', async (req: Request, res: Response) => {
    const { managedCsmNames } = req.body ?? {};
    if (!Array.isArray(managedCsmNames) || !managedCsmNames.every((n) => typeof n === 'string')) {
      res.status(400).json({ error: 'managedCsmNames must be a string array.' });
      return;
    }
    const updated = await admin.users.setManagedCsmNames(ORG, req.params.id ?? '', managedCsmNames);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: publicUser(updated) });
  });

  adminRouter.get('/thresholds', async (_req: Request, res: Response) => {
    res.json({ override: await admin.thresholds.get(ORG) });
  });

  adminRouter.put('/thresholds', async (req: Request, res: Response) => {
    const patch = req.body?.override as ThresholdOverride | undefined;
    if (!patch || typeof patch !== 'object') {
      res.status(400).json({ error: 'override object is required.' });
      return;
    }
    const override = await admin.thresholds.set(ORG, patch);
    await admin.auditLog.record({
      orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
      action: 'threshold.changed', target: Object.keys(patch).join(', '),
    });
    res.json({ override });
  });

  adminRouter.post('/thresholds/reset', async (req: Request, res: Response) => {
    const key = req.body?.key as string | undefined;
    const override = await admin.thresholds.reset(ORG, key as never);
    await admin.auditLog.record({
      orgId: ORG, actorUserId: req.user!.id, actorEmail: req.user!.email,
      action: 'threshold.reset', target: key ?? 'all',
    });
    res.json({ override });
  });

  adminRouter.get('/audit-log', async (_req: Request, res: Response) => {
    res.json({ events: await admin.auditLog.list(ORG) });
  });

  adminRouter.get('/org-settings', async (_req: Request, res: Response) => {
    res.json({ settings: await admin.orgSettings.get(ORG) });
  });

  adminRouter.put('/org-settings', async (req: Request, res: Response) => {
    const patch = req.body ?? {};
    const settings = await admin.orgSettings.update(ORG, patch);
    res.json({ settings });
  });

  app.use('/api/admin', adminRouter);

  // Optionally serve the built SPA so one process hosts everything.
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile('index.html', { root: opts.staticDir });
    });
  }

  return app;
}

function publicUser(user: { id: string; email: string; name: string; role: string; orgId: string; managedCsmNames?: string[]; createdAt: string; lastActiveAt: string | null }) {
  // Never returns a password hash — there isn't one on the `User` domain object at
  // all (UserStore keeps hashes internal), but this is the explicit boundary.
  return user;
}

function isRole(value: unknown): value is 'csm' | 'manager' | 'exec' | 'admin' {
  return value === 'csm' || value === 'manager' || value === 'exec' || value === 'admin';
}

/**
 * Composes and sends the invite email. The invite record is ALWAYS already
 * persisted by the time this runs (`inviteUser`/`resendInvite` create it first), so
 * a send failure never loses the invite — it just means the admin needs to hit
 * "Resend" (or share the link manually) once the provider issue is fixed. Never
 * throws: the caller always gets a clear `{ sent, error }` back instead of a 500
 * that would suggest the invite itself failed.
 */
async function sendInviteEmail(
  admin: AdminServices,
  cfg: ServerConfig,
  invite: Invite,
  inviterName: string,
): Promise<{ sent: boolean; error?: string }> {
  const orgSettings = await admin.orgSettings.get(invite.orgId);
  const acceptUrl = `${cfg.appBaseUrl.replace(/\/$/, '')}/invite/${invite.token}`;
  try {
    await admin.email.sendInvite({ to: invite.email, orgName: orgSettings.name, inviterName, role: invite.role, acceptUrl });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: String(err instanceof Error ? err.message : err) };
  }
}
