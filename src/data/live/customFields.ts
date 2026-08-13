/**
 * Resilient accessors for Salesforce custom fields surfaced through Merge.
 *
 * Per-org Salesforce config is inconsistent: the same concept ("ARR") shows up as
 * `ARR`, `arr`, `Annual_Recurring_Revenue__c`, etc., or is missing entirely. These
 * helpers try a list of candidate keys and coerce defensively, returning a fallback
 * rather than throwing when a field is absent or the wrong type.
 */

type Fields = Record<string, unknown> | null | undefined;

function firstPresent(fields: Fields, keys: string[]): unknown {
  if (!fields) return undefined;
  for (const k of keys) {
    if (k in fields && fields[k] !== null && fields[k] !== undefined && fields[k] !== '') {
      return fields[k];
    }
  }
  return undefined;
}

export function getNumberField(fields: Fields, keys: string[], fallback: number): number {
  const raw = firstPresent(fields, keys);
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[,$\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function getStringField(fields: Fields, keys: string[], fallback: string): string {
  const raw = firstPresent(fields, keys);
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return fallback;
}

export function getBoolField(fields: Fields, keys: string[], fallback: boolean): boolean {
  const raw = firstPresent(fields, keys);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['true', 'yes', '1', 'y'].includes(v)) return true;
    if (['false', 'no', '0', 'n'].includes(v)) return false;
  }
  if (typeof raw === 'number') return raw !== 0;
  return fallback;
}

/** A usage time-series may be stored as a JSON string or array in a custom field. */
export function getUsageSeriesField(
  fields: Fields,
  keys: string[],
): { asOf: string; activeUsers: number }[] {
  const raw = firstPresent(fields, keys);
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: { asOf: string; activeUsers: number }[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const asOf = rec.asOf ?? rec.date ?? rec.as_of;
      const active = rec.activeUsers ?? rec.active_users ?? rec.value;
      if (typeof asOf === 'string' && (typeof active === 'number' || typeof active === 'string')) {
        const n = typeof active === 'number' ? active : Number(active);
        if (Number.isFinite(n)) out.push({ asOf, activeUsers: n });
      }
    }
  }
  return out;
}
