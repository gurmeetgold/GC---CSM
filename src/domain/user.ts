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

/** A pending invite — no password set yet, no session possible until accepted. */
export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  invitedByUserId: string;
  createdAt: string;
}
