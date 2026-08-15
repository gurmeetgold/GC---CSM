import { describe, it, expect } from 'vitest';
import { MockIntegrationsStore, LiveIntegrationsStore } from './integrationsStore';
import { EncryptedInMemoryTokenStore } from '../integrations/auth/tokenStore';
import { generateKeyBase64 } from '../integrations/auth/crypto';

const ORG = 'org-1';

describe('MockIntegrationsStore', () => {
  it('starts every card not_connected', async () => {
    const store = new MockIntegrationsStore();
    const cards = await store.list(ORG);
    expect(cards).toHaveLength(5);
    expect(cards.every((c) => c.status === 'not_connected')).toBe(true);
  });

  it('connect() simulates a connected state for ANY of the five kinds, no credentials needed', async () => {
    const store = new MockIntegrationsStore();
    for (const kind of ['crm', 'helpdesk', 'slack', 'google', 'microsoft'] as const) {
      const card = await store.connect(ORG, kind);
      expect(card.status).toBe('connected');
      expect(card.lastSyncedAt).not.toBeNull();
    }
  });

  it('disconnect() reverts to not_connected', async () => {
    const store = new MockIntegrationsStore();
    await store.connect(ORG, 'crm');
    const card = await store.disconnect(ORG, 'crm');
    expect(card.status).toBe('not_connected');
    expect(card.lastSyncedAt).toBeNull();
  });

  it('every card names what it honestly powers', async () => {
    const store = new MockIntegrationsStore();
    const cards = await store.list(ORG);
    expect(cards.every((c) => c.powers.length > 0)).toBe(true);
  });
});

describe('LiveIntegrationsStore', () => {
  function makeStore() {
    const tokens = new EncryptedInMemoryTokenStore(generateKeyBase64());
    return { store: new LiveIntegrationsStore(tokens), tokens };
  }

  it('crm/helpdesk reflect the real TokenStore', async () => {
    const { store, tokens } = makeStore();
    expect((await store.list(ORG)).find((c) => c.kind === 'crm')!.status).toBe('not_connected');
    await tokens.save(ORG, { provider: 'salesforce', accountToken: 'tok' });
    expect((await store.list(ORG)).find((c) => c.kind === 'crm')!.status).toBe('connected');
  });

  it('connect() refuses for integrations with no real OAuth flow (slack/google/microsoft)', async () => {
    const { store } = makeStore();
    await expect(store.connect(ORG, 'slack')).rejects.toThrow(/SETUP_SLACK/);
  });

  it('unbuilt integrations always report liveFlowAvailable: false and not_connected', async () => {
    const { store } = makeStore();
    const cards = await store.list(ORG);
    for (const kind of ['slack', 'google', 'microsoft'] as const) {
      const card = cards.find((c) => c.kind === kind)!;
      expect(card.liveFlowAvailable).toBe(false);
      expect(card.status).toBe('not_connected');
    }
  });

  it('disconnect() deletes the underlying token', async () => {
    const { store, tokens } = makeStore();
    await tokens.save(ORG, { provider: 'ticketing', accountToken: 'tok' });
    await store.disconnect(ORG, 'helpdesk');
    expect(await tokens.get(ORG, 'ticketing')).toBeNull();
  });
});
