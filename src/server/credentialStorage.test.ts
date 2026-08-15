import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthService } from '../auth/authService';
import { InMemoryUserStore } from '../auth/userStore';
import { InMemorySessionStore } from '../auth/sessionStore';
import { InMemoryInviteStore } from '../auth/inviteStore';
import { LoggingMailer } from '../auth/mailer';
import { EncryptedInMemoryTokenStore } from '../integrations/auth/tokenStore';
import { generateKeyBase64 } from '../integrations/auth/crypto';

const PLAINTEXT_PASSWORD = 'super-secret-plaintext-99';
const PLAINTEXT_TOKEN = 'sf-account-token-abc123';

describe('credential storage: no plaintext, no logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a user password is never stored as plaintext anywhere reachable from UserStore', async () => {
    const users = new InMemoryUserStore();
    const sessions = new InMemorySessionStore();
    const invites = new InMemoryInviteStore();
    const mailer = new LoggingMailer({ info: () => {} });
    const auth = new AuthService(users, sessions, invites, mailer);

    const user = await auth.bootstrapFirstAdmin('org-1', { email: 'a@co.com', name: 'A', password: PLAINTEXT_PASSWORD });

    // Every reachable read of the user (by id, by email, by list) must never surface
    // the plaintext password — the domain `User` type has no password field at all.
    expect(JSON.stringify(user)).not.toContain(PLAINTEXT_PASSWORD);
    expect(JSON.stringify(await users.findById('org-1', user.id))).not.toContain(PLAINTEXT_PASSWORD);
    expect(JSON.stringify(await users.list('org-1'))).not.toContain(PLAINTEXT_PASSWORD);
  });

  it('login never logs the plaintext password to console', async () => {
    const users = new InMemoryUserStore();
    const sessions = new InMemorySessionStore();
    const invites = new InMemoryInviteStore();
    const mailer = new LoggingMailer({ info: () => {} });
    const auth = new AuthService(users, sessions, invites, mailer);
    await auth.bootstrapFirstAdmin('org-1', { email: 'a@co.com', name: 'A', password: PLAINTEXT_PASSWORD });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await auth.login('org-1', 'a@co.com', PLAINTEXT_PASSWORD);

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(PLAINTEXT_PASSWORD);
      }
    }
  });

  it('an invited user’s accept-invite password never appears in the invite-send log', async () => {
    const users = new InMemoryUserStore();
    const sessions = new InMemorySessionStore();
    const invites = new InMemoryInviteStore();
    const seen: unknown[] = [];
    const mailer = new LoggingMailer({ info: (msg, meta) => seen.push([msg, meta]) });
    const auth = new AuthService(users, sessions, invites, mailer);

    const admin = await auth.bootstrapFirstAdmin('org-1', { email: 'a@co.com', name: 'A', password: PLAINTEXT_PASSWORD });
    const { inviteId } = await auth.inviteUser('org-1', admin.id, { email: 'b@co.com', role: 'csm' });
    await auth.acceptInvite('org-1', inviteId, { name: 'B', password: PLAINTEXT_PASSWORD });

    expect(JSON.stringify(seen)).not.toContain(PLAINTEXT_PASSWORD);
  });

  it('integration tokens are stored encrypted at rest, never as plaintext', async () => {
    const store = new EncryptedInMemoryTokenStore(generateKeyBase64());
    await store.save('org-1', { provider: 'salesforce', accountToken: PLAINTEXT_TOKEN });

    // Reach into the store's internal row (same technique DATA_HANDLING.md's Phase 2
    // encryption story relies on) to prove the ciphertext never contains the secret.
    const rows = (store as unknown as { rows: Map<string, string> }).rows;
    const ciphertext = rows.get('org-1:salesforce')!;
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain(PLAINTEXT_TOKEN);

    // The only way back to plaintext is through the typed accessor.
    expect((await store.get('org-1', 'salesforce'))!.accountToken).toBe(PLAINTEXT_TOKEN);
  });
});
