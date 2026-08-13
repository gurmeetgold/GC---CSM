/**
 * The mock data is anchored to a fixed reference "now" so that relative dates
 * (renewals, last-contact, usage snapshots) trip the intended signals
 * deterministically — the same demo and the same test results every run.
 *
 * The app pins the engine clock to this value when the mock source is active, so
 * the instant-demo path is reproducible. The live source will use the real clock.
 */
export const REFERENCE_NOW = new Date('2026-08-13T12:00:00.000Z');

const DAY_MS = 86_400_000;

/** ISO date `n` days before the reference now. */
export function daysAgo(n: number): string {
  return new Date(REFERENCE_NOW.getTime() - n * DAY_MS).toISOString();
}

/** ISO date `n` days after the reference now. */
export function daysAhead(n: number): string {
  return new Date(REFERENCE_NOW.getTime() + n * DAY_MS).toISOString();
}
