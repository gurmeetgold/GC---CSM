import { randomBytes } from 'node:crypto';

/**
 * Opaque bearer session tokens. Same interface-seam pattern as the rest of the auth
 * layer — `InMemorySessionStore` for dev/tests, a Redis/Postgres-backed store swaps
 * in later. Tokens are random (not JWTs) so a session can be revoked server-side
 * instantly on logout — nothing to "invalidate" cryptographically.
 */
export interface Session {
  token: string;
  userId: string;
  orgId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionStore {
  create(userId: string, orgId: string): Promise<Session>;
  get(token: string): Promise<Session | null>;
  destroy(token: string): Promise<void>;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private readonly ttlMs = SESSION_TTL_MS, private readonly clock: () => number = Date.now) {}

  async create(userId: string, orgId: string): Promise<Session> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock();
    const session: Session = {
      token,
      userId,
      orgId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
    this.sessions.set(token, session);
    return session;
  }

  async get(token: string): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= this.clock()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  async destroy(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}
