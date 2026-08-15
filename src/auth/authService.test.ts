import { describe, it, expect } from 'vitest';
import { AuthService, AuthError } from './authService';
import { InMemoryUserStore } from './userStore';
import { InMemorySessionStore } from './sessionStore';
import { InMemoryInviteStore } from './inviteStore';
import { hashPassword, verifyPassword } from './passwords';

const ORG = 'org-1';

function makeService(clock?: () => Date) {
  const users = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const invites = clock ? new InMemoryInviteStore(clock) : new InMemoryInviteStore();
  return { service: new AuthService(users, sessions, invites), users, sessions, invites };
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

describe('AuthService invites (Phase 8: token-based, does not send email itself)', () => {
  it('creates a pending invite with a real random token distinct from its id', async () => {
    const { service } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const invite = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });
    expect(invite.status).toBe('pending');
    expect(invite.token).toBeTruthy();
    expect(invite.token).not.toBe(invite.id);
    expect(invite.token.length).toBeGreaterThan(20);
  });

  it('accept-by-token creates the account with the invited role and marks the invite accepted (not deleted)', async () => {
    const { service, invites } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const invite = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });

    const created = await service.acceptInvite(invite.token, { name: 'CSM Person', password: 'pw123456' });
    expect(created.role).toBe('csm');
    expect(created.email).toBe('csm@co.com');
    expect(created.orgId).toBe(ORG);

    const stored = await invites.findById(ORG, invite.id);
    expect(stored?.status).toBe('accepted');
  });

  it('rejects an unknown token', async () => {
    const { service } = makeService();
    await expect(service.acceptInvite('not-a-real-token', { name: 'X', password: 'pw123456' })).rejects.toThrow(AuthError);
  });

  it('rejects reusing an already-accepted token (single-use, enforced by status)', async () => {
    const { service } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const invite = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });
    await service.acceptInvite(invite.token, { name: 'First', password: 'pw123456' });
    await expect(service.acceptInvite(invite.token, { name: 'Second', password: 'pw123456' })).rejects.toThrow(/already been used/);
  });

  it('rejects an expired token', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const { service, users } = makeService(() => now);
    const admin = await users.create({ orgId: ORG, email: 'a@co.com', name: 'A', role: 'admin', password: 'pw123456' });
    const invite = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });

    now = new Date('2026-04-05T00:00:00Z'); // 94 days later, past the 90-day TTL
    await expect(service.acceptInvite(invite.token, { name: 'X', password: 'pw123456' })).rejects.toThrow(/expired/);
  });

  it('rejects an invite for an email that already has an account, without letting them silently create a duplicate', async () => {
    const { service, users } = makeService();
    const admin = await users.create({ orgId: ORG, email: 'a@co.com', name: 'A', role: 'admin', password: 'pw123456' });
    await users.create({ orgId: ORG, email: 'existing@co.com', name: 'Existing', role: 'csm', password: 'pw123456' });
    const invite = await service.inviteUser(ORG, admin.id, { email: 'existing@co.com', role: 'csm' });
    await expect(service.acceptInvite(invite.token, { name: 'X', password: 'pw123456' })).rejects.toThrow(/already exists/);
  });

  it('validateInviteToken reports each failure reason distinctly', async () => {
    const { service, users } = makeService();
    const admin = await users.create({ orgId: ORG, email: 'a@co.com', name: 'A', role: 'admin', password: 'pw123456' });

    expect(await service.validateInviteToken('nope')).toEqual({ ok: false, reason: 'not_found' });

    const invite = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });
    const ok = await service.validateInviteToken(invite.token);
    expect(ok.ok).toBe(true);

    await service.acceptInvite(invite.token, { name: 'X', password: 'pw123456' });
    const used = await service.validateInviteToken(invite.token);
    expect(used).toMatchObject({ ok: false, reason: 'already_used' });
  });

  it('resendInvite issues a fresh token and invalidates the old one', async () => {
    const { service } = makeService();
    const admin = await service.bootstrapFirstAdmin(ORG, { email: 'a@co.com', name: 'A', password: 'pw123456' });
    const original = await service.inviteUser(ORG, admin.id, { email: 'csm@co.com', role: 'csm' });
    const resent = await service.resendInvite(ORG, original.id);

    expect(resent.token).not.toBe(original.token);
    expect((await service.validateInviteToken(original.token)).ok).toBe(false);
    expect((await service.validateInviteToken(resent.token)).ok).toBe(true);
  });

  it('resendInvite on an unknown invite id throws', async () => {
    const { service } = makeService();
    await expect(service.resendInvite(ORG, 'nope')).rejects.toThrow(AuthError);
  });
});
