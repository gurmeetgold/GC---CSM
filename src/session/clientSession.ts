/**
 * Where the browser keeps the current session token. A tiny module-level accessor
 * (not React state) so `HttpBookProvider`/`HttpAnswerEngine` — built once at the
 * composition root before login state exists — can read the current token on every
 * request without being re-constructed on login/logout. The app's `AuthProvider` is
 * the only writer; everything else only reads.
 *
 * Lives at the top level (a peer of `domain/`, `data/`, `answer/`, `app/`) rather
 * than under `app/`, since `answer/http/HttpAnswerEngine.ts` needs it too — putting
 * it under `app/` would have `answer/` importing upward, which decision #1's
 * layering rule forbids.
 *
 * Persisted to `localStorage` so a page refresh doesn't force a re-login.
 */

const STORAGE_KEY = 'signalos.session.token';

let currentToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

export function getSessionToken(): string | null {
  return currentToken;
}

export function setSessionToken(token: string | null): void {
  currentToken = token;
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(STORAGE_KEY, token);
  else localStorage.removeItem(STORAGE_KEY);
}

/** Convenience for building fetch headers against the backend. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getSessionToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}
