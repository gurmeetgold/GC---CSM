/**
 * Domain: users and roles. Introduced in Phase 7 — the admin console's first-class
 * auth model. Pure types; zero logic, zero imports (same rule as the rest of `domain/`).
 */

/**
 * - `csm`     — sees Portfolio/Accounts/Renewals/Support for their own book.
 * - `manager` — same screens, scoped to their assigned CSMs' accounts (not the whole org).
 * - `exec`    — everything a manager sees, PLUS Executive View (whole org, unscoped).
 * - `admin`   — everything `exec` sees, PLUS the Admin Console (integrations, users,
 *   thresholds, security, org settings). Admin implies exec-level visibility so an
 *   admin is never blocked from a page they administer.
 */
export type Role = 'csm' | 'manager' | 'exec' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  /**
   * Set only for `manager` role. Book ownership is CRM-driven (`Account.ownerCsm`,
   * a name string from the CRM owner field — see DECISIONS.md #34), so a manager's
   * scope is expressed the same way: the `ownerCsm` name(s) they're assigned to
   * oversee, not a foreign key to another `User`. A `csm` user's own book scope is
   * simply "accounts where `ownerCsm === this user's name`" — nothing extra stored.
   */
  managedCsmNames?: string[];
  createdAt: string;
  lastActiveAt: string | null;
}

/** Lifecycle of an invite record (Phase 8). `expired` is computed at read time from
 *  `expiresAt`, not a separate write — a store never needs a cron to "expire" one. */
export type InviteStatus = 'pending' | 'accepted' | 'expired';

/**
 * An invite to join an org. `token` is the secret the accept link carries — a
 * cryptographically random value, distinct from `id` (`id` is a stable, non-secret
 * row identifier used for admin actions like resend; `token` is what proves the
 * holder was actually emailed the link, and rotates on resend). No password is set
 * until the invite is accepted.
 */
export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  invitedByUserId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  /** Set once the invite is used; the record stays (unlike Phase 7's delete-on-accept)
   *  so admins can see "Accepted" in the Users & Roles list instead of the invite
   *  silently vanishing. */
  status: InviteStatus;
}
