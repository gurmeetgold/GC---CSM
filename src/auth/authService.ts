import type { Invite, Role, User } from '../domain';
import type { UserStore } from './userStore';
import type { SessionStore, Session } from './sessionStore';
import type { InviteStore } from './inviteStore';

export class AuthError extends Error {}

/** Distinct reasons an invite can fail to validate — the UI shows a different
 *  message for each rather than one generic "invalid invite" (see AcceptInviteScreen). */
export type InviteValidationFailure = 'not_found' | 'expired' | 'already_used' | 'already_registered';

export type InviteValidation =
  | { ok: true; invite: Invite }
  | { ok: false; reason: InviteValidationFailure; invite?: Invite };

/**
 * The auth application service: login, first-admin bootstrap, and invites. Kept
 * separate from the Express layer so it's testable with zero HTTP (same pattern as
 * `BookService`). Does NOT send email itself — `inviteUser`/`resendInvite` return the
 * `Invite` (which carries the token) and the HTTP layer composes + sends the message,
 * since building the accept link and the org/inviter names needs context (org
 * settings, the inviting user's name) this service doesn't otherwise hold.
 */
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly sessions: SessionStore,
    private readonly invites: InviteStore,
  ) {}

  async login(orgId: string, email: string, password: string): Promise<{ user: User; session: Session }> {
    const user = await this.users.verifyCredentials(orgId, email, password);
    if (!user) throw new AuthError('Invalid email or password.');
    await this.users.touchLastActive(orgId, user.id);
    const session = await this.sessions.create(user.id, orgId);
    return { user, session };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.destroy(token);
  }

  async currentUser(token: string): Promise<User | null> {
    const session = await this.sessions.get(token);
    if (!session) return null;
    return this.users.findById(session.orgId, session.userId);
  }

  /**
   * First-run only: creates the first `admin` user for an org. Refuses once the org
   * already has any users — this is the entire security model for the bootstrap
   * endpoint (no invite-only escalation path exists after the first admin).
   */
  async bootstrapFirstAdmin(orgId: string, input: { email: string; name: string; password: string }): Promise<User> {
    const existing = await this.users.count(orgId);
    if (existing > 0) {
      throw new AuthError('This org already has an admin. Ask an existing admin to invite you.');
    }
    return this.users.create({ orgId, email: input.email, name: input.name, role: 'admin', password: input.password });
  }

  async inviteUser(orgId: string, invitedByUserId: string, input: { email: string; role: Role }): Promise<Invite> {
    return this.invites.create({ orgId, email: input.email, role: input.role, invitedByUserId });
  }

  /** Regenerates the token/expiry for an existing invite (the admin "Resend" action). */
  async resendInvite(orgId: string, inviteId: string): Promise<Invite> {
    const invite = await this.invites.regenerate(orgId, inviteId);
    if (!invite) throw new AuthError('Invite not found.');
    return invite;
  }

  /**
   * Validates an accept-invite token WITHOUT consuming it — used both by the public
   * "show me the org/role before I set a password" screen and as the first step of
   * `acceptInvite` itself, so the two never disagree about what's valid.
   */
  async validateInviteToken(token: string): Promise<InviteValidation> {
    const invite = await this.invites.findByToken(token);
    if (!invite) return { ok: false, reason: 'not_found' };
    if (invite.status === 'expired') return { ok: false, reason: 'expired', invite };
    if (invite.status === 'accepted') return { ok: false, reason: 'already_used', invite };
    const existingUser = await this.users.findByEmail(invite.orgId, invite.email);
    if (existingUser) return { ok: false, reason: 'already_registered', invite };
    return { ok: true, invite };
  }

  /** Accepting an invite creates the real user account and marks the invite used
   *  (the record stays, with `status: 'accepted'`, so admins can see it happened). */
  async acceptInvite(token: string, input: { name: string; password: string }): Promise<User> {
    const validation = await this.validateInviteToken(token);
    if (!validation.ok) {
      throw new AuthError(
        validation.reason === 'expired' ? 'This invite has expired.'
        : validation.reason === 'already_used' ? 'This invite has already been used.'
        : validation.reason === 'already_registered' ? 'An account already exists for this email — log in instead.'
        : 'Invite not found.',
      );
    }
    const { invite } = validation;
    const user = await this.users.create({
      orgId: invite.orgId,
      email: invite.email,
      name: input.name,
      role: invite.role,
      password: input.password,
    });
    await this.invites.markAccepted(invite.orgId, invite.id);
    return user;
  }
}
