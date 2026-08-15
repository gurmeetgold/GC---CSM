import { randomBytes } from 'node:crypto';
import type { Invite, Role } from '../domain';

const INVITE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (owner-approved, Phase 8)

/**
 * Pending invites. Phase 7 sent no real email and used the invite's own sequential
 * `id` as the accept token — guessable, no expiry, deleted on accept so the admin
 * console could never show "Accepted". Phase 8 fixes all three: a separate
 * crypto-random `token`, a 90-day `expiresAt`, and a persisted `status` so
 * single-use is enforced by state (`pending` → `accepted`), not deletion.
 */
export interface InviteStore {
  create(input: { orgId: string; email: string; role: Role; invitedByUserId: string }): Promise<Invite>;
  list(orgId: string): Promise<Invite[]>;
  findById(orgId: string, id: string): Promise<Invite | null>;
  /** Looks up by the secret token from the accept link — the only lookup an
   *  unauthenticated visitor can perform. */
  findByToken(token: string): Promise<Invite | null>;
  markAccepted(orgId: string, id: string): Promise<void>;
  /** Issues a fresh token + expiry for an existing invite (the "Resend" action) and
   *  resets status to `pending` — the OLD token stops working immediately. */
  regenerate(orgId: string, id: string): Promise<Invite | null>;
  remove(orgId: string, id: string): Promise<void>;
}

function freshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Computes the effective status at read time — `expired` is derived from
 *  `expiresAt`, never written by a background job. */
function effectiveStatus(invite: Invite, now: () => Date): Invite {
  if (invite.status === 'pending' && new Date(invite.expiresAt).getTime() <= now().getTime()) {
    return { ...invite, status: 'expired' };
  }
  return invite;
}

export class InMemoryInviteStore implements InviteStore {
  private rows = new Map<string, Invite>(); // by id
  private byToken = new Map<string, string>(); // token -> id
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date(), private readonly ttlMs = INVITE_TTL_MS) {}

  async create(input: { orgId: string; email: string; role: Role; invitedByUserId: string }): Promise<Invite> {
    const id = `invite-${++this.seq}`;
    const token = freshToken();
    const now = this.clock();
    const invite: Invite = {
      id,
      orgId: input.orgId,
      email: input.email,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      status: 'pending',
    };
    this.rows.set(id, invite);
    this.byToken.set(token, id);
    return { ...invite }; // copy: regenerate() mutates the stored row in place later
  }

  async list(orgId: string): Promise<Invite[]> {
    return [...this.rows.values()].filter((i) => i.orgId === orgId).map((i) => effectiveStatus(i, this.clock));
  }

  async findById(orgId: string, id: string): Promise<Invite | null> {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) return null;
    return effectiveStatus(row, this.clock);
  }

  async findByToken(token: string): Promise<Invite | null> {
    const id = this.byToken.get(token);
    if (!id) return null;
    const row = this.rows.get(id);
    return row ? effectiveStatus(row, this.clock) : null;
  }

  async markAccepted(orgId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.orgId === orgId) row.status = 'accepted';
  }

  async regenerate(orgId: string, id: string): Promise<Invite | null> {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) return null;
    this.byToken.delete(row.token); // old link stops working immediately
    const now = this.clock();
    row.token = freshToken();
    row.createdAt = now.toISOString();
    row.expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();
    row.status = 'pending';
    this.byToken.set(row.token, id);
    return { ...row };
  }

  async remove(orgId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.orgId === orgId) {
      this.byToken.delete(row.token);
      this.rows.delete(id);
    }
  }
}
