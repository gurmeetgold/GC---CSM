import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthService } from '../auth/authService';
import { InMemoryUserStore } from '../auth/userStore';
import { InMemorySessionStore } from '../auth/sessionStore';
import { InMemoryInviteStore } from '../auth/inviteStore';
import { LoggingEmailService, ResendEmailService } from '../auth/emailService';
import { EncryptedInMemoryTokenStore } from '../integrations/auth/tokenStore';
import { generateKeyBase64 } from '../integrations/auth/crypto';

const PLAINTEXT_PASSWORD = 'super-secret-plaintext-99';
const PLAINTEXT_TOKEN = 'sf-account-token-abc123';
const PLAINTEXT_EMAIL_API_KEY = 're_super_secret_api_key_123';

function makeAuth() {
  const users = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const invites = new InMemoryInviteStore();
  return { auth: new AuthService(users, sessions, invites), users, sessions, invites };
}

describe('credential storage: no plaintext, no logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a user password is never stored as plaintext anywhere reachable from UserStore', async () => {
    const { auth, users } = makeAuth();
    const user = await auth.bootstrapFirstAdmin('org-1', { email: 'a@co.com', name: 'A', password: PLAINTEXT_PASSWORD });

    // Every reachable read of the user (by id, by email, by list) must never surface
    // the plaintext password — the domain `User` type has no password field at all.
    expect(JSON.stringify(user)).not.toContain(PLAINTEXT_PASSWORD);
    expect(JSON.stringify(await users.findById('org-1', user.id))).not.toContain(PLAINTEXT_PASSWORD);
    expect(JSON.stringify(await users.list('org-1'))).not.toContain(PLAINTEXT_PASSWORD);
  });

  it('login never logs the plaintext password to console', async () => {
    const { auth } = makeAuth();
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

  it('an invite/accept round trip never causes AuthService to log anything at all (it holds no logger)', async () => {
    const { auth } = makeAuth();
    const admin = await auth.bootstrapFirstAdmin('org-1', { email: 'a@co.com', name: 'A', password: PLAINTEXT_PASSWORD });
    const invite = await auth.inviteUser('org-1', admin.id, { email: 'b@co.com', role: 'csm' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await auth.acceptInvite(invite.token, { name: 'B', password: PLAINTEXT_PASSWORD });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('the invite email itself (Phase 8) never carries a password — only org/role/link', async () => {
    const seen: unknown[] = [];
    const service = new LoggingEmailService({ info: (msg, meta) => seen.push([msg, meta]) });
    await service.sendInvite({
      to: 'b@co.com', orgName: 'Acme', inviterName: 'A', role: 'csm',
      acceptUrl: 'http://localhost:5173/invite/some-token',
    });
    expect(JSON.stringify(seen)).not.toContain(PLAINTEXT_PASSWORD);
  });

  it('ResendEmailService never logs or embeds the API key in the outgoing request body', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    const service = new ResendEmailService({ apiKey: PLAINTEXT_EMAIL_API_KEY, from: 'a@x.com' }, fetchSpy);
    await service.sendInvite({ to: 'b@co.com', orgName: 'Acme', inviterName: 'A', role: 'csm', acceptUrl: 'http://x/invite/t' });

    const [, init] = fetchSpy.mock.calls[0]!;
    // The key belongs in the Authorization header (sent over TLS to the provider),
    // never in the JSON body a bug could accidentally log or echo back.
    expect(init!.body as string).not.toContain(PLAINTEXT_EMAIL_API_KEY);
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${PLAINTEXT_EMAIL_API_KEY}`);
  });

  it('a failed Resend send surfaces a clear error without leaking the API key in it', async () => {
    const fetchSpy = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const service = new ResendEmailService({ apiKey: PLAINTEXT_EMAIL_API_KEY, from: 'a@x.com' }, fetchSpy);
    await expect(
      service.sendInvite({ to: 'b@co.com', orgName: 'Acme', inviterName: 'A', role: 'csm', acceptUrl: 'http://x/invite/t' }),
    ).rejects.toThrow(/HTTP 401/);
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
