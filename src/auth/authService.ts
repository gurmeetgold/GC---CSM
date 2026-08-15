import type { Role, User } from '../domain';
import type { UserStore } from './userStore';
import type { SessionStore, Session } from './sessionStore';
import type { InviteStore } from './inviteStore';
import type { Mailer } from './mailer';

export class AuthError extends Error {}

/**
 * The auth application service: login, first-admin bootstrap, and invites. Kept
 * separate from the Express layer so it's testable with zero HTTP (same pattern as
 * `BookService`).
 */
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly sessions: SessionStore,
    private readonly invites: InviteStore,
    private readonly mailer: Mailer,
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

  async inviteUser(
    orgId: string,
    invitedByUserId: string,
    input: { email: string; role: Role },
  ): Promise<{ inviteId: string }> {
    const invite = await this.invites.create({ orgId, email: input.email, role: input.role, invitedByUserId });
    await this.mailer.sendInvite(input.email, orgId, invite.id, input.role);
    return { inviteId: invite.id };
  }

  /** Accepting an invite creates the real user account and consumes the invite. */
  async acceptInvite(orgId: string, inviteId: string, input: { name: string; password: string }): Promise<User> {
    const invites = await this.invites.list(orgId);
    const invite = invites.find((i) => i.id === inviteId);
    if (!invite) throw new AuthError('Invite not found or already used.');
    const user = await this.users.create({
      orgId,
      email: invite.email,
      name: input.name,
      role: invite.role,
      password: input.password,
    });
    await this.invites.remove(orgId, inviteId);
    return user;
  }
}
