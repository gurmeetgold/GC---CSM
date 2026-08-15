import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing (scrypt, Node's built-in — no new dependency, same "no vendor
 * secret-management dependency this phase" posture as `integrations/auth/crypto.ts`).
 *
 * Stored format is self-describing: `scrypt.<saltB64>.<hashB64>`, so the KDF can be
 * rotated later without breaking existing hashes. Plaintext passwords are never
 * stored, logged, or returned by any store method.
 */

const KEY_LEN = 64;

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, KEY_LEN);
  return ['scrypt', salt.toString('base64'), hash.toString('base64')].join('.');
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const parts = stored.split('.');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64!, 'base64');
  const expected = Buffer.from(hashB64!, 'base64');
  const actual = scryptSync(plaintext, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
