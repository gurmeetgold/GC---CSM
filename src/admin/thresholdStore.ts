import type { ThresholdOverride } from '../domain';

/**
 * Persists a per-org partial `ThresholdOverride`. This is the ENTIRE threshold-config
 * refactor this phase needed: `resolveThresholds()` and `buildBook({ thresholds })`
 * already existed (Phase 1, decision #6) and already accept an override with zero
 * engine changes. The admin console just needs somewhere to keep that override
 * between requests — no signal-engine code is touched.
 */
export interface ThresholdStore {
  get(orgId: string): Promise<ThresholdOverride>;
  /** Deep-merges `patch` over the currently stored override (per top-level key). */
  set(orgId: string, patch: ThresholdOverride): Promise<ThresholdOverride>;
  /** Clears one top-level threshold key back to the shipped default, or all keys if omitted. */
  reset(orgId: string, key?: keyof ThresholdOverride): Promise<ThresholdOverride>;
}

export class InMemoryThresholdStore implements ThresholdStore {
  private overrides = new Map<string, ThresholdOverride>();

  async get(orgId: string): Promise<ThresholdOverride> {
    return { ...(this.overrides.get(orgId) ?? {}) };
  }

  async set(orgId: string, patch: ThresholdOverride): Promise<ThresholdOverride> {
    const current = this.overrides.get(orgId) ?? {};
    const merged: ThresholdOverride = { ...current };
    for (const key of Object.keys(patch) as (keyof ThresholdOverride)[]) {
      merged[key] = { ...(current[key] as object), ...(patch[key] as object) } as never;
    }
    this.overrides.set(orgId, merged);
    return { ...merged };
  }

  async reset(orgId: string, key?: keyof ThresholdOverride): Promise<ThresholdOverride> {
    if (!key) {
      this.overrides.delete(orgId);
      return {};
    }
    const current = { ...(this.overrides.get(orgId) ?? {}) };
    delete current[key];
    this.overrides.set(orgId, current);
    return { ...current };
  }
}
