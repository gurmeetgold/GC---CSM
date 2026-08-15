import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role, User } from '../../domain';
import { getSessionToken, setSessionToken, authHeaders } from '../../session/clientSession';

interface AuthState {
  /** null while the very first "is there a session / is there an admin yet" check is running. */
  status: 'loading' | 'needs-bootstrap' | 'signed-out' | 'signed-in';
  user: User | null;
  error: string | null;
}

export type InviteValidationResult =
  | { valid: true; orgName: string; role: string; email: string }
  | { valid: false; reason: 'not_found' | 'expired' | 'already_used' | 'already_registered' };

interface AuthContextValue extends AuthState {
  login(email: string, password: string): Promise<void>;
  bootstrapAdmin(input: { email: string; name: string; password: string }): Promise<void>;
  /** Read-only: shows what an invite token is for, without consuming it. Public — works logged out. */
  validateInvite(token: string): Promise<InviteValidationResult>;
  acceptInvite(input: { token: string; name: string; password: string }): Promise<void>;
  logout(): Promise<void>;
  /** True once role/exec/admin gating actually applies (a backend is configured). */
  authEnabled: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}

/** Least-privilege helpers — kept here so every gate in the app agrees on the rule. */
export function canSeeExecutiveView(role: Role | undefined): boolean {
  return role === 'exec' || role === 'admin';
}
export function canSeeAdminConsole(role: Role | undefined): boolean {
  return role === 'admin';
}

export function AuthProvider({ baseUrl, children }: { baseUrl: string | undefined; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, error: null });
  const api = useMemo(() => (baseUrl ? baseUrl.replace(/\/$/, '') : null), [baseUrl]);

  const refresh = useCallback(async () => {
    if (!api) {
      // No backend configured: the zero-credential local demo, unchanged from before
      // Phase 7 — no login, no roles, no admin console.
      setState({ status: 'signed-in', user: null, error: null });
      return;
    }
    const token = getSessionToken();
    if (token) {
      const res = await fetch(`${api}/api/auth/me`, { headers: authHeaders() });
      if (res.ok) {
        const { user } = (await res.json()) as { user: User };
        setState({ status: 'signed-in', user, error: null });
        return;
      }
      setSessionToken(null); // stale/expired session
    }
    const statusRes = await fetch(`${api}/api/auth/org-status`);
    const { hasAdmin } = (await statusRes.json()) as { hasAdmin: boolean };
    setState({ status: hasAdmin ? 'signed-out' : 'needs-bootstrap', user: null, error: null });
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!api) return;
      const res = await fetch(`${api}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setState((s) => ({ ...s, error: 'Invalid email or password.' }));
        return;
      }
      const { token, user } = (await res.json()) as { token: string; user: User };
      setSessionToken(token);
      setState({ status: 'signed-in', user, error: null });
    },
    [api],
  );

  const bootstrapAdmin = useCallback(
    async (input: { email: string; name: string; password: string }) => {
      if (!api) return;
      const res = await fetch(`${api}/api/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState((s) => ({ ...s, error: body.error ?? 'Could not create the first admin.' }));
        return;
      }
      const { token, user } = (await res.json()) as { token: string; user: User };
      setSessionToken(token);
      setState({ status: 'signed-in', user, error: null });
    },
    [api],
  );

  const validateInvite = useCallback(
    async (token: string): Promise<InviteValidationResult> => {
      if (!api) return { valid: false, reason: 'not_found' };
      const res = await fetch(`${api}/api/auth/invite/${encodeURIComponent(token)}`);
      const body = await res.json();
      return res.ok ? { valid: true, ...body } : { valid: false, reason: body.reason ?? 'not_found' };
    },
    [api],
  );

  const acceptInvite = useCallback(
    async (input: { token: string; name: string; password: string }) => {
      if (!api) return;
      const res = await fetch(`${api}/api/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState((s) => ({ ...s, error: body.error ?? 'Could not accept the invite.' }));
        return;
      }
      const { token, user } = (await res.json()) as { token: string; user: User };
      setSessionToken(token);
      setState({ status: 'signed-in', user, error: null });
    },
    [api],
  );

  const logout = useCallback(async () => {
    if (api) {
      await fetch(`${api}/api/auth/logout`, { method: 'POST', headers: authHeaders() }).catch(() => {});
    }
    setSessionToken(null);
    setState({ status: 'signed-out', user: null, error: null });
  }, [api]);

  const value: AuthContextValue = { ...state, login, bootstrapAdmin, validateInvite, acceptInvite, logout, authEnabled: !!api };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
