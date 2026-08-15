import type { Invite, Role } from '../domain';

/**
 * Pending invites. No email service exists in this codebase yet, so "sending" an
 * invite logs it instead (see `NEXT.md`) — the invite record itself is real and
 * drives the Users & Roles page's pending-invite list.
 */
export interface InviteStore {
  create(input: { orgId: string; email: string; role: Role; invitedByUserId: string }): Promise<Invite>;
  list(orgId: string): Promise<Invite[]>;
  remove(orgId: string, id: string): Promise<void>;
}

export class InMemoryInviteStore implements InviteStore {
  private rows = new Map<string, Invite>();
  private seq = 0;

  async create(input: { orgId: string; email: string; role: Role; invitedByUserId: string }): Promise<Invite> {
    const invite: Invite = {
      id: `invite-${++this.seq}`,
      orgId: input.orgId,
      email: input.email,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(invite.id, invite);
    return invite;
  }

  async list(orgId: string): Promise<Invite[]> {
    return [...this.rows.values()].filter((i) => i.orgId === orgId);
  }

  async remove(orgId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.orgId === orgId) this.rows.delete(id);
  }
}
