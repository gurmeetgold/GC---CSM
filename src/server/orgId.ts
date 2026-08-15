/**
 * This deployment's org id. The rest of the codebase (config, `DataSource`, etc.) is
 * single-tenant per deployment — one `.env`, one set of vendor credentials — so
 * Phase 7's `orgId`-scoped stores (users, sessions, integrations, thresholds, audit
 * log) all key off this single constant for now. Multi-tenancy (resolving `orgId`
 * per request, e.g. from a subdomain or path) is future work; every store already
 * takes `orgId` as a parameter so that swap doesn't touch call sites' logic, only
 * how this constant is resolved.
 */
export const DEFAULT_ORG_ID = 'default';
