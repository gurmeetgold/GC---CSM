import type { Role, User } from '../domain';
import { hashPassword, verifyPassword } from './passwords';

/**
 * Where users (and their password hashes) live. Same drop-in-interface seam as
 * `DataSource`/`TokenStore` — `InMemoryUserStore` for dev/tests, a Postgres-backed
 * store swaps in later behind the identical interface. Password hashes never leave
 * this module: every read method returns `User`, never the stored credential row.
 */
export interface UserStore {
  /** Create a user with a password. Rejects if the email is already taken in this org. */
  create(input: { orgId: string; email: string; name: string; role: Role; password: string }): Promise<User>;
  findByEmail(orgId: string, email: string): Promise<User | null>;
  findById(orgId: string, id: string): Promise<User | null>;
  list(orgId: string): Promise<User[]>;
  count(orgId: string): Promise<number>;
  /** Verifies a login attempt; never reveals whether the email or the password was wrong. */
  verifyCredentials(orgId: string, email: string, password: string): Promise<User | null>;
  setRole(orgId: string, id: string, role: Role): Promise<User | null>;
  setManagedCsmNames(orgId: string, id: string, managedCsmNames: string[]): Promise<User | null>;
  touchLastActive(orgId: string, id: string): Promise<void>;
}

interface Row {
  user: User;
  passwordHash: string;
}

export class InMemoryUserStore implements UserStore {
  private rows = new Map<string, Row>(); // key: `${orgId}:${id}`
  private byEmail = new Map<string, string>(); // key: `${orgId}:${email.toLowerCase()}` -> id
  private seq = 0;

  private key(orgId: string, id: string): string {
    return `${orgId}:${id}`;
  }
  private emailKey(orgId: string, email: string): string {
    return `${orgId}:${email.toLowerCase()}`;
  }

  async create(input: { orgId: string; email: string; name: string; role: Role; password: string }): Promise<User> {
    const existing = await this.findByEmail(input.orgId, input.email);
    if (existing) throw new Error('A user with this email already exists in this org.');

    const id = `user-${++this.seq}`;
    const user: User = {
      id,
      email: input.email,
      name: input.name,
      role: input.role,
      orgId: input.orgId,
      createdAt: new Date().toISOString(),
      lastActiveAt: null,
    };
    this.rows.set(this.key(input.orgId, id), { user, passwordHash: hashPassword(input.password) });
    this.byEmail.set(this.emailKey(input.orgId, input.email), id);
    return { ...user };
  }

  async findByEmail(orgId: string, email: string): Promise<User | null> {
    const id = this.byEmail.get(this.emailKey(orgId, email));
    if (!id) return null;
    return this.findById(orgId, id);
  }

  async findById(orgId: string, id: string): Promise<User | null> {
    const row = this.rows.get(this.key(orgId, id));
    return row ? { ...row.user } : null;
  }

  async list(orgId: string): Promise<User[]> {
    return [...this.rows.values()].filter((r) => r.user.orgId === orgId).map((r) => ({ ...r.user }));
  }

  async count(orgId: string): Promise<number> {
    return (await this.list(orgId)).length;
  }

  async verifyCredentials(orgId: string, email: string, password: string): Promise<User | null> {
    const id = this.byEmail.get(this.emailKey(orgId, email));
    if (!id) return null;
    const row = this.rows.get(this.key(orgId, id));
    if (!row) return null;
    if (!verifyPassword(password, row.passwordHash)) return null;
    return { ...row.user };
  }

  async setRole(orgId: string, id: string, role: Role): Promise<User | null> {
    const row = this.rows.get(this.key(orgId, id));
    if (!row) return null;
    row.user = { ...row.user, role };
    return { ...row.user };
  }

  async setManagedCsmNames(orgId: string, id: string, managedCsmNames: string[]): Promise<User | null> {
    const row = this.rows.get(this.key(orgId, id));
    if (!row) return null;
    row.user = { ...row.user, managedCsmNames };
    return { ...row.user };
  }

  async touchLastActive(orgId: string, id: string): Promise<void> {
    const row = this.rows.get(this.key(orgId, id));
    if (!row) return;
    row.user = { ...row.user, lastActiveAt: new Date().toISOString() };
  }
}
