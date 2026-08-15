import { describe, it, expect } from 'vitest';
import { InMemoryOrgSettingsStore } from './orgSettingsStore';

describe('InMemoryOrgSettingsStore', () => {
  it('returns sensible defaults for a new org', async () => {
    const store = new InMemoryOrgSettingsStore();
    const settings = await store.get('org-1');
    expect(settings.name).toBe('My Organization');
    expect(settings.notifyOn.critical_risk).toBe(true);
  });

  it('update() merges a patch, including nested notifyOn', async () => {
    const store = new InMemoryOrgSettingsStore();
    await store.update('org-1', { name: 'Acme CS', notifyOn: { sla_breach: false } as never });
    const settings = await store.get('org-1');
    expect(settings.name).toBe('Acme CS');
    expect(settings.notifyOn.sla_breach).toBe(false);
    expect(settings.notifyOn.critical_risk).toBe(true); // untouched
  });
});
