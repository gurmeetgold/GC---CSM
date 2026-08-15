import { InMemoryUserStore, type UserStore } from '../auth/userStore';
import { InMemorySessionStore, type SessionStore } from '../auth/sessionStore';
import { InMemoryInviteStore, type InviteStore } from '../auth/inviteStore';
import { LoggingMailer, type Mailer } from '../auth/mailer';
import { AuthService } from '../auth/authService';
import { InMemoryThresholdStore, type ThresholdStore } from '../admin/thresholdStore';
import { InMemoryAuditLogStore, type AuditLogStore } from '../admin/auditLog';
import { InMemoryOrgSettingsStore, type OrgSettingsStore } from '../admin/orgSettingsStore';
import { MockIntegrationsStore, LiveIntegrationsStore, type IntegrationsStore } from '../admin/integrationsStore';
import { EncryptedInMemoryTokenStore, type TokenStore } from '../integrations/auth/tokenStore';
import { generateKeyBase64 } from '../integrations/auth/crypto';
import type { ServerConfig } from './config';

/**
 * The auth + admin-console composition root — same pattern as `factory.ts` for the
 * data/answer seams. All stores are in-memory (see `DECISIONS.md` #34): this phase
 * intentionally does not stand up a database. Each store is a small interface, so a
 * Postgres-backed implementation drops in later behind the identical seam, same as
 * `DataSource` always has.
 */
export interface AdminServices {
  users: UserStore;
  sessions: SessionStore;
  invites: InviteStore;
  mailer: Mailer;
  auth: AuthService;
  thresholds: ThresholdStore;
  auditLog: AuditLogStore;
  orgSettings: OrgSettingsStore;
  integrations: IntegrationsStore;
  tokens: TokenStore;
}

export function buildAdminServices(cfg: ServerConfig): AdminServices {
  const users = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const invites = new InMemoryInviteStore();
  const mailer = new LoggingMailer();
  const auth = new AuthService(users, sessions, invites, mailer);
  const thresholds = new InMemoryThresholdStore();
  const auditLog = new InMemoryAuditLogStore();
  const orgSettings = new InMemoryOrgSettingsStore();

  // Token encryption needs a real key in live mode; mock mode can run with a
  // generated ephemeral key since no real secret is ever stored.
  // Live mode should always set TOKEN_ENCRYPTION_KEY explicitly (see DATA_HANDLING.md).
  // Mock mode never stores a real secret through this store, so a fresh ephemeral key
  // per process start is fine and keeps the zero-credential demo zero-config.
  const encryptionKey = cfg.tokenEncryptionKey ?? generateKeyBase64();
  const tokens = new EncryptedInMemoryTokenStore(encryptionKey);

  const integrations: IntegrationsStore =
    cfg.dataSource === 'mock' ? new MockIntegrationsStore() : new LiveIntegrationsStore(tokens);

  return { users, sessions, invites, mailer, auth, thresholds, auditLog, orgSettings, integrations, tokens };
}
