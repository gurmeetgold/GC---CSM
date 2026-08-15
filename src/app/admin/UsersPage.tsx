import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { adminApi } from './adminApi';
import type { Role, User, Invite } from '../../domain';

const ROLES: Role[] = ['csm', 'manager', 'exec', 'admin'];

export function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('csm');
  const [sending, setSending] = useState(false);

  async function load() {
    const res = await adminApi.listUsers();
    setUsers(res.users);
    setInvites(res.invites);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onInvite() {
    if (!inviteEmail.trim()) return;
    setSending(true);
    setError(null);
    try {
      await adminApi.inviteUser(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function onRoleChange(user: User, role: Role) {
    try {
      await adminApi.setUserRole(user.id, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!users) return <p className="text-sm text-ink-soft">Loading users…</p>;

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg border border-risk-red/40 bg-risk-redBg px-3 py-2 text-sm text-risk-red">{error}</p>
      )}

      <Card title="Invite a teammate" subtitle="No email service is configured yet — the invite is logged server-side rather than emailed (see NEXT.md). Share the accept link manually for now.">
        <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Email</span>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              type="email"
              placeholder="name@company.com"
              className="w-64 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Role</span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink focus-visible:border-brand focus-visible:bg-surface"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={sending}
            onClick={() => void onInvite()}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-card hover:bg-brand-hover disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
        {invites.length > 0 && (
          <div className="border-t border-line px-5 py-3">
            <div className="text-xs font-semibold text-ink-soft">Pending invites</div>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-soft">
              {invites.map((i) => <li key={i.id}>{i.email} — invited as {i.role}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Org members" subtitle="CSM-to-account assignment is CRM-owner-driven (Account.ownerCsm) — read-only here so it never diverges from the Book Balance widget.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2">Name</th>
                <th className="px-5 py-2">Email</th>
                <th className="px-5 py-2">Role</th>
                <th className="px-5 py-2">Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium text-ink">{u.name}</td>
                  <td className="px-5 py-2.5 text-ink-soft">{u.email}</td>
                  <td className="px-5 py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) => void onRoleChange(u, e.target.value as Role)}
                      className="rounded-lg border border-line bg-surface-sunken px-2 py-1 text-sm text-ink"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-2.5 text-ink-faint">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
