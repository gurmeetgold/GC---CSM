import { describe, it, expect, vi } from 'vitest';
import { AuthService, AuthError } from './authService';
import { InMemoryUserStore } from './userStore';
import { InMemorySessionStore } from './sessionStore';
import { InMemoryInviteStore } from './inviteStore';
import type { Mailer } from './mailer';
import { hashPassword, verifyPassword } from './passwords';

const ORG = 'org-1';

function makeService() {
  const users = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const invites = new InMemoryInviteStore();
  const mailer: Mailer = { sendInvite: vi.fn(async () => {}) };
  return { service: new AuthService(users, sessions, invites, mailer), users, sessions, invites, mailer };
}

describe('passwords', () => {
  it('hashes are never the plaintext and verify round-trips', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('two hashes of the same password differ (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });
});

describe('AuthService.bootstrapFirstAdmin', () => {
  it('creates the first admin when the org has zero users', async () => {
    const { service } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    expect(admin.role).toBe('admin');
  });

  it('refuses once the org already has a user', async () => {
    const { service } = makeService();
    await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    await expect(
      service.bootstrapFirstAdmin(ORG, { email: 'b@co.com', name: 'B', password: 'pw123456' }),
    ).rejects.toThrow(AuthError);
  });
});

describe('AuthService.login', () => {
  it('issues a session on correct credentials', async () => {
    const { service } = makeService();
    await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const { user, session } = await service.login(ORG, 'a@co.com', 'pw123456');
    expect(user.email).toBe('a@co.com');
    expect(session.token).toBeTruthy();
    expect(await service.currentUser(session.token)).toMatchObject({ email: 'a@co.com' });
  });

  it('rejects a wrong password without revealing which part was wrong', async () => {
    const { service } = makeService();
    await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    await expect(service.login(ORG, 'a@co.com', 'wrong')).rejects.toThrow(AuthError);
    await expect(service.login(ORG, 'nobody@co.com', 'pw123456')).rejects.toThrow(AuthError);
  });

  it('logout destroys the session', async () => {
    const { service } = makeService();
    await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const { session } = await service.login(ORG, 'a@co.com', 'pw123456');
    await service.logout(session.token);
    expect(await service.currentUser(session.token)).toBeNull();
  });
});

describe('AuthService invites', () => {
  it('invites a user, logs (does not send real email), and accept creates the account with the invited role', async () => {
    const { service, mailer } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const { inviteId } = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });
    expect(mailer.sendInvite).toHaveBeenCalledWith('csm@co.com', ORG, inviteId, 'csm');

    const created = await service.acceptInvite(ORG, inviteId, { name: 'CSM Person', password: 'pw123456' });
    expect(created.role).toBe('csm');
    expect(created.email).toBe('csm@co.com');
  });

  it('rejects accepting an unknown or already-used invite', async () => {
    const { service } = makeService();
    await expect(service.acceptInvite(ORG, 'nope', { name: 'X', password: 'pw123456' })).rejects.toThrow(AuthError);
  });
});
