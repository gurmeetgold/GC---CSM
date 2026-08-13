import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated symmetric encryption for tokens at rest (AES-256-GCM).
 *
 * The master key comes from the secret store (env `TOKEN_ENCRYPTION_KEY`, 32 bytes
 * base64) and is never hardcoded or logged. Ciphertext is self-describing:
 * `v1.<iv>.<authTag>.<ciphertext>` (all base64), so key rotation can key off the
 * version prefix later.
 */

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export class EncryptionKeyError extends Error {}

function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new EncryptionKeyError('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(encoded: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EncryptionKeyError('Malformed or unsupported ciphertext.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/** Generate a fresh base64 master key (for ops/rotation docs). */
export function generateKeyBase64(): string {
  return randomBytes(32).toString('base64');
}
