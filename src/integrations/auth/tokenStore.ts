import { decryptSecret, encryptSecret } from './crypto';

/**
 * Where connected-integration tokens live. Values are encrypted at rest; the store
 * never returns or logs plaintext except through the explicit `get` accessor a
 * caller uses to make a request.
 *
 * `TokenStore` is an interface so the in-memory dev implementation and a future
 * Postgres-backed one are interchangeable — same drop-in seam as DataSource.
 */

export type Provider = 'salesforce' | 'gong' | 'ticketing';

export interface StoredToken {
  provider: Provider;
  /** The Merge linked-account token or vendor token needed to make API calls. */
  accountToken: string;
  /** Optional refresh token, when the provider issues one. */
  refreshToken?: string;
  /** ISO expiry, when known. */
  expiresAt?: string;
}

export interface TokenStore {
  save(orgId: string, token: StoredToken): Promise<void>;
  get(orgId: string, provider: Provider): Promise<StoredToken | null>;
  delete(orgId: string, provider: Provider): Promise<void>;
}

/**
 * In-memory store that still encrypts values at rest (proving the encryption path
 * and keeping plaintext out of memory dumps/logs). A Postgres implementation swaps
 * the Map for a table with an identical interface.
 */
export class EncryptedInMemoryTokenStore implements TokenStore {
  private readonly rows = new Map<string, string>(); // key → ciphertext

  constructor(private readonly base64Key: string) {}

  private key(orgId: string, provider: Provider): string {
    return `${orgId}:${provider}`;
  }

  async save(orgId: string, token: StoredToken): Promise<void> {
    const ciphertext = encryptSecret(JSON.stringify(token), this.base64Key);
    this.rows.set(this.key(orgId, token.provider), ciphertext);
  }

  async get(orgId: string, provider: Provider): Promise<StoredToken | null> {
    const ciphertext = this.rows.get(this.key(orgId, provider));
    if (!ciphertext) return null;
    return JSON.parse(decryptSecret(ciphertext, this.base64Key)) as StoredToken;
  }

  async delete(orgId: string, provider: Provider): Promise<void> {
    this.rows.delete(this.key(orgId, provider));
  }
}
