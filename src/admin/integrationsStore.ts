import type { ConnectionStatus } from '../data';
import type { Provider, TokenStore } from '../integrations/auth/tokenStore';

/**
 * The five integration cards the Integrations page shows. `crm` and `helpdesk` map
 * onto the real Merge Link flow already built in Phase 5 (`MergeLinkService` +
 * `TokenStore`, providers `salesforce`/`ticketing`). `slack`, `google`, `microsoft`
 * have NO live OAuth flow built anywhere in this codebase yet (Slack was explicitly
 * deferred in Phase 5 — see `SETUP_SLACK.md`) — their cards say so honestly rather
 * than pretending a connect flow exists. In mock mode all five simulate a connected
 * state so the console is fully demoable with zero credentials.
 */
export type IntegrationKind = 'crm' | 'helpdesk' | 'slack' | 'google' | 'microsoft';

export interface IntegrationCard {
  kind: IntegrationKind;
  label: string;
  powers: string;
  status: ConnectionStatus | 'error';
  lastSyncedAt: string | null;
  /** Whether a real Connect flow exists for this integration in live mode. */
  liveFlowAvailable: boolean;
}

const CATALOG: Record<IntegrationKind, { label: string; powers: string; liveFlowAvailable: boolean }> = {
  crm: { label: 'CRM (Merge)', powers: 'Powers Portfolio, Accounts, Renewals, and Executive View.', liveFlowAvailable: true },
  helpdesk: { label: 'Help Desk (Merge)', powers: 'Powers Support and the support-strain / SLA signals.', liveFlowAvailable: true },
  slack: { label: 'Slack', powers: 'Would power deal-room activity and champion-silence context.', liveFlowAvailable: false },
  google: { label: 'Google Workspace', powers: 'Would power email/calendar engagement signals.', liveFlowAvailable: false },
  microsoft: { label: 'Microsoft 365', powers: 'Would power email/calendar engagement signals (M365 tenants).', liveFlowAvailable: false },
};

const KIND_TO_PROVIDER: Partial<Record<IntegrationKind, Provider>> = {
  crm: 'salesforce',
  helpdesk: 'ticketing',
};

interface IntegrationsLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}
const noopLogger: IntegrationsLogger = { warn: () => {} };

export interface IntegrationsStore {
  list(orgId: string): Promise<IntegrationCard[]>;
  connect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard>;
  disconnect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard>;
}

/**
 * Mock-mode implementation: "connecting" simulates a connected state (with a fake
 * sync timestamp) rather than hitting real OAuth — the whole admin console is
 * demoable with `DATA_SOURCE=mock` and no credentials, per the phase guardrail.
 */
export class MockIntegrationsStore implements IntegrationsStore {
  private state = new Map<string, Map<IntegrationKind, IntegrationCard>>();

  private orgState(orgId: string): Map<IntegrationKind, IntegrationCard> {
    let m = this.state.get(orgId);
    if (!m) {
      m = new Map();
      for (const kind of Object.keys(CATALOG) as IntegrationKind[]) {
        m.set(kind, { kind, ...CATALOG[kind], status: 'not_connected', lastSyncedAt: null });
      }
      this.state.set(orgId, m);
    }
    return m;
  }

  async list(orgId: string): Promise<IntegrationCard[]> {
    return [...this.orgState(orgId).values()];
  }

  async connect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard> {
    const m = this.orgState(orgId);
    const card: IntegrationCard = { kind, ...CATALOG[kind], status: 'connected', lastSyncedAt: new Date().toISOString() };
    m.set(kind, card);
    return card;
  }

  async disconnect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard> {
    const m = this.orgState(orgId);
    const card: IntegrationCard = { kind, ...CATALOG[kind], status: 'not_connected', lastSyncedAt: null };
    m.set(kind, card);
    return card;
  }
}

/**
 * Live-mode implementation: `crm`/`helpdesk` connect/disconnect through the real
 * `TokenStore` (so a Connect here actually enables `DATA_SOURCE=live`). `slack`,
 * `google`, `microsoft` have no backing flow — connect() rejects rather than
 * fabricating a connected state; the card always reports `liveFlowAvailable: false`.
 */
export class LiveIntegrationsStore implements IntegrationsStore {
  private lastSynced = new Map<string, string>(); // `${orgId}:${kind}` -> ISO

  constructor(private readonly tokens: TokenStore, private readonly logger: IntegrationsLogger = noopLogger) {}

  private syncKey(orgId: string, kind: IntegrationKind): string {
    return `${orgId}:${kind}`;
  }

  async list(orgId: string): Promise<IntegrationCard[]> {
    const out: IntegrationCard[] = [];
    for (const kind of Object.keys(CATALOG) as IntegrationKind[]) {
      out.push(await this.cardFor(orgId, kind));
    }
    return out;
  }

  private async cardFor(orgId: string, kind: IntegrationKind): Promise<IntegrationCard> {
    const meta = CATALOG[kind];
    const provider = KIND_TO_PROVIDER[kind];
    if (!provider) {
      return { kind, ...meta, status: 'not_connected', lastSyncedAt: null };
    }
    const token = await this.tokens.get(orgId, provider);
    return {
      kind,
      ...meta,
      status: token ? 'connected' : 'not_connected',
      lastSyncedAt: token ? this.lastSynced.get(this.syncKey(orgId, kind)) ?? null : null,
    };
  }

  async connect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard> {
    const provider = KIND_TO_PROVIDER[kind];
    if (!provider) {
      throw new Error(`No live connect flow exists yet for "${kind}" — see SETUP_SLACK.md.`);
    }
    // The actual OAuth exchange (Merge Link) happens via MergeLinkService before this
    // is called; by the time connect() is invoked the token is already saved. This
    // just marks the sync timestamp and re-reads status from the TokenStore.
    this.lastSynced.set(this.syncKey(orgId, kind), new Date().toISOString());
    this.logger.warn('integration marked connected', { orgId, kind });
    return this.cardFor(orgId, kind);
  }

  async disconnect(orgId: string, kind: IntegrationKind): Promise<IntegrationCard> {
    const provider = KIND_TO_PROVIDER[kind];
    if (provider) {
      await this.tokens.delete(orgId, provider);
      this.lastSynced.delete(this.syncKey(orgId, kind));
    }
    return this.cardFor(orgId, kind);
  }
}
