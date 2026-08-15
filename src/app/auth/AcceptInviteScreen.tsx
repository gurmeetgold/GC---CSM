import { useEffect, useState, type FormEvent } from 'react';
import { useAuth, type InviteValidationResult } from './AuthContext';

const REASON_COPY: Record<Exclude<InviteValidationResult, { valid: true }>['reason'], { title: string; body: string }> = {
  not_found: { title: 'This invite link isn’t valid', body: 'Double-check the link, or ask whoever invited you to send a fresh one.' },
  expired: { title: 'This invite has expired', body: 'Invite links are valid for 90 days. Ask an admin to resend your invite.' },
  already_used: { title: 'This invite has already been used', body: 'If that was you, log in instead. If not, ask an admin to resend a fresh invite.' },
  already_registered: { title: 'You already have an account', body: 'An account for this email already exists — log in instead of accepting the invite again.' },
};

/**
 * Public — reachable while signed out (that's the whole point). Three phases:
 * checking the token, showing a clear failure state (expired / used / no account
 * needed), or the name+password form for a valid invite.
 */
export function AcceptInviteScreen({ token, onGoToLogin }: { token: string; onGoToLogin: () => void }) {
  const { validateInvite, acceptInvite, error } = useAuth();
  const [result, setResult] = useState<InviteValidationResult | 'loading'>('loading');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void validateInvite(token).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [token, validateInvite]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await acceptInvite({ token, name, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-7 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-[#5b8dff] text-sm font-bold text-white">S</span>
          <span className="text-[18px] font-semibold tracking-tight text-ink">SignalOS</span>
        </div>

        {result === 'loading' && <p className="text-sm text-ink-soft">Checking your invite…</p>}

        {result !== 'loading' && !result.valid && (
          <div>
            <h1 className="text-lg font-semibold text-ink">{REASON_COPY[result.reason].title}</h1>
            <p className="mt-1 text-sm text-ink-soft">{REASON_COPY[result.reason].body}</p>
            <button
              type="button"
              onClick={onGoToLogin}
              className="mt-5 w-full rounded-lg bg-brand px-3.5 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-brand-hover"
            >
              Go to sign in
            </button>
          </div>
        )}

        {result !== 'loading' && result.valid && (
          <div>
            <h1 className="text-lg font-semibold text-ink">Join {result.orgName} on SignalOS</h1>
            <p className="mt-1 text-sm text-ink-soft">
              You're invited as <strong className="text-ink">{result.role}</strong> ({result.email}). Set a name and password to finish.
            </p>

            <form className="mt-5 space-y-3" onSubmit={onSubmit}>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">Your name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-risk-red/40 bg-risk-redBg px-3 py-2 text-sm text-risk-red">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-brand px-3.5 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-brand-hover disabled:opacity-60"
              >
                {submitting ? 'Please wait…' : 'Accept invite & continue'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
