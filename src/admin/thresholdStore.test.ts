import { describe, it, expect } from 'vitest';
import { InMemoryThresholdStore } from './thresholdStore';

describe('InMemoryThresholdStore', () => {
  it('returns an empty override for an org with no changes', async () => {
    const store = new InMemoryThresholdStore();
    expect(await store.get('org-1')).toEqual({});
  });

  it('set() deep-merges a patch, leaving other keys untouched', async () => {
    const store = new InMemoryThresholdStore();
    await store.set('org-1', { usageDecline: { dropPct: 15, windowDays: 90 } });
    await store.set('org-1', { adoptionGap: { minActivePctOfSeats: 40 } });
    const override = await store.get('org-1');
    expect(override).toEqual({
      usageDecline: { dropPct: 15, windowDays: 90 },
      adoptionGap: { minActivePctOfSeats: 40 },
    });
  });

  it('reset(key) clears just that key', async () => {
    const store = new InMemoryThresholdStore();
    await store.set('org-1', { usageDecline: { dropPct: 15, windowDays: 90 }, adoptionGap: { minActivePctOfSeats: 40 } });
    await store.reset('org-1', 'usageDecline');
    expect(await store.get('org-1')).toEqual({ adoptionGap: { minActivePctOfSeats: 40 } });
  });

  it('reset() with no key clears everything for the org', async () => {
    const store = new InMemoryThresholdStore();
    await store.set('org-1', { usageDecline: { dropPct: 15, windowDays: 90 } });
    await store.reset('org-1');
    expect(await store.get('org-1')).toEqual({});
  });

  it('orgs are isolated from each other', async () => {
    const store = new InMemoryThresholdStore();
    await store.set('org-1', { usageDecline: { dropPct: 15, windowDays: 90 } });
    expect(await store.get('org-2')).toEqual({});
  });
});
