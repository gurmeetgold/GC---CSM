import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';

/**
 * The login gate for backend-configured deployments. Shows the first-run "create
 * the first admin" form when the org has zero users yet (see `AuthContext`'s
 * `needs-bootstrap` status, driven by `GET /api/auth/org-status`), otherwise a plain
 * email/password login form. Matches the SignalOS visual identity (DESIGN.md tokens).
 */
export function LoginScreen() {
  const { status, error, login, bootstrapAdmin } = useAuth();
  const isBootstrap = status === 'needs-bootstrap';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isBootstrap) await bootstrapAdmin({ email, name, password });
      else await login(email, password);
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

        <h1 className="text-lg font-semibold text-ink">{isBootstrap ? 'Create the first admin account' : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isBootstrap
            ? 'No admin exists for this org yet. This account will have full access to the admin console.'
            : 'Use the account an admin created or invited for you.'}
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          {isBootstrap && (
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            />
          </Field>

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
            {submitting ? 'Please wait…' : isBootstrap ? 'Create admin account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
