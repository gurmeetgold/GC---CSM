import type { EvaluatedAccount } from '../answer';
import type { User } from '../domain';

/**
 * Applies the role's book scope to an evaluated book, server-side, so scoping can't
 * be bypassed by calling the API directly (see DECISIONS.md #34 for the "manager
 * sees only their assigned CSMs" call).
 *
 *   - `csm`     → only accounts where `ownerCsm` is this user's own name.
 *   - `manager` → only accounts owned by the CSM names in `managedCsmNames`.
 *   - `exec`/`admin` → the whole org, unscoped.
 */
export function scopeBookForUser(book: EvaluatedAccount[], user: User): EvaluatedAccount[] {
  if (user.role === 'exec' || user.role === 'admin') return book;
  if (user.role === 'csm') return book.filter((e) => e.account.ownerCsm === user.name);
  if (user.role === 'manager') {
    const names = new Set(user.managedCsmNames ?? []);
    return book.filter((e) => names.has(e.account.ownerCsm));
  }
  return book;
}
