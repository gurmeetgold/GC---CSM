import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, generateKeyBase64, EncryptionKeyError } from './crypto';
import { EncryptedInMemoryTokenStore } from './tokenStore';
import { MergeLinkService } from './mergeLink';

const KEY = generateKeyBase64();

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const ct = encryptSecret('super-secret-token', KEY);
    expect(ct).not.toContain('super-secret-token'); // not plaintext
    expect(decryptSecret(ct, KEY)).toBe('super-secret-token');
  });

  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('fails to decrypt with the wrong key', () => {
    const ct = encryptSecret('x', KEY);
    expect(() => decryptSecret(ct, generateKeyBase64())).toThrow();
  });

  it('rejects a malformed key', () => {
    expect(() => encryptSecret('x', 'too-short')).toThrow(EncryptionKeyError);
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const ct = encryptSecret('x', KEY);
    const tampered = ct.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });
});

describe('EncryptedInMemoryTokenStore', () => {
  it('stores tokens encrypted and returns them decrypted', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    await store.save('org-1', { provider: 'salesforce', accountToken: 'acct-tok-123' });
    const got = await store.get('org-1', 'salesforce');
    expect(got?.accountToken).toBe('acct-tok-123');
  });

  it('isolates tokens by org and provider', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    await store.save('org-1', { provider: 'salesforce', accountToken: 't1' });
    expect(await store.get('org-2', 'salesforce')).toBeNull();
    expect(await store.get('org-1', 'gong')).toBeNull();
  });

  it('deletes tokens', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    await store.save('org-1', { provider: 'gong', accountToken: 't' });
    await store.delete('org-1', 'gong');
    expect(await store.get('org-1', 'gong')).toBeNull();
  });
});

describe('MergeLinkService (connect flow)', () => {
  it('creates a link token', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    const fetchImpl = async () =>
      new Response(JSON.stringify({ link_token: 'lt-abc' }), { status: 200 });
    const svc = new MergeLinkService({ baseUrl: 'https://x', accessKey: 'k' }, store, fetchImpl);
    expect(await svc.createLinkToken('org-1', 'salesforce')).toBe('lt-abc');
  });

  it('exchanges the public token and stores the account token encrypted', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    const fetchImpl = async () =>
      new Response(JSON.stringify({ account_token: 'at-xyz' }), { status: 200 });
    const svc = new MergeLinkService({ baseUrl: 'https://x', accessKey: 'k' }, store, fetchImpl);
    await svc.completeConnection('org-1', 'salesforce', 'public-123');
    const stored = await store.get('org-1', 'salesforce');
    expect(stored?.accountToken).toBe('at-xyz');
  });

  it('throws on a failed exchange', async () => {
    const store = new EncryptedInMemoryTokenStore(KEY);
    const fetchImpl = async () => new Response('nope', { status: 400 });
    const svc = new MergeLinkService({ baseUrl: 'https://x', accessKey: 'k' }, store, fetchImpl);
    await expect(svc.completeConnection('o', 'salesforce', 'p')).rejects.toThrow();
  });
});
