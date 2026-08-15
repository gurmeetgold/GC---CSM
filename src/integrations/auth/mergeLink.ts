import type { Provider, TokenStore } from './tokenStore';

/**
 * The "Connect Salesforce / Gong" flow, via Merge Link.
 *
 * Flow (backend + frontend):
 *   1. Backend `createLinkToken(orgId, provider)` → short-lived link token.
 *   2. Frontend opens Merge Link with it; the customer authorizes the vendor.
 *   3. Merge hands the frontend a `public_token`; frontend POSTs it back.
 *   4. Backend `completeConnection(orgId, provider, publicToken)` exchanges it for a
 *      durable `account_token`, which is stored ENCRYPTED via the TokenStore.
 *
 * Raw OAuth with Salesforce/Gong is delegated to Merge, so we never handle vendor
 * client secrets or refresh loops ourselves. The exchange is injectable (`fetchImpl`)
 * so tests never hit the network.
 */

export interface MergeLinkConfig {
  baseUrl: string; // https://api.merge.dev/api/integrations
  accessKey: string; // Merge production access key
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

const PROVIDER_TO_MERGE_INTEGRATION: Record<Provider, { category: string; integration: string }> = {
  salesforce: { category: 'crm', integration: 'Salesforce' },
  gong: { category: 'crm', integration: 'Gong' }, // Gong surfaced via Merge's conversation/CRM link
  ticketing: { category: 'ticketing', integration: 'Zendesk' },
};

export class MergeLinkService {
  constructor(
    private readonly cfg: MergeLinkConfig,
    private readonly tokens: TokenStore,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  /** Step 1: mint a link token the frontend uses to open Merge Link. */
  async createLinkToken(orgId: string, provider: Provider): Promise<string> {
    const meta = PROVIDER_TO_MERGE_INTEGRATION[provider];
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/create-link-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        end_user_origin_id: orgId,
        end_user_organization_name: orgId,
        categories: [meta.category],
        integration: meta.integration,
      }),
    });
    if (!res.ok) throw new Error(`create-link-token failed: HTTP ${res.status}`);
    const body = (await res.json()) as { link_token?: string };
    if (!body.link_token) throw new Error('create-link-token returned no link_token');
    return body.link_token;
  }

  /** Steps 3–4: exchange the public token for an account token and store it encrypted. */
  async completeConnection(orgId: string, provider: Provider, publicToken: string): Promise<void> {
    const res = await this.fetchImpl(
      `${this.cfg.baseUrl}/account-token/${encodeURIComponent(publicToken)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${this.cfg.accessKey}` } },
    );
    if (!res.ok) throw new Error(`account-token exchange failed: HTTP ${res.status}`);
    const body = (await res.json()) as { account_token?: string };
    if (!body.account_token) throw new Error('account-token exchange returned no token');

    await this.tokens.save(orgId, { provider, accountToken: body.account_token });
    // NB: we intentionally do not log the token or the response body.
  }
}
