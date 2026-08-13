/**
 * Pure time helpers for the engine. No `Date.now()` calls inside signals —
 * the reference "now" is always injected, so every evaluation is deterministic
 * and testable.
 */

/** Whole days from `iso` until `now` (positive = in the past). null if unparseable/null. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** Whole days from `now` until `iso` (positive = in the future). null if unparseable/null. */
export function daysUntil(iso: string | null, now: Date): number | null {
  const d = daysSince(iso, now);
  return d === null ? null : -d;
}
