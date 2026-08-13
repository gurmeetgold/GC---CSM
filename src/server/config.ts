import { resolveDataSourceKind, type DataSourceKind } from '../data';
import { resolveAnswerEngineKind, type AnswerEngineKind } from '../answer';

/**
 * Server-side configuration, resolved from the secret store (env). Reads a plain
 * record so it is unit-testable. NOTHING here is logged; callers pass the resolved
 * config straight into clients.
 *
 * The two switches are independent by design: DATA_SOURCE governs the data source,
 * ANSWER_ENGINE governs the answer/soft-signal engine. Live data + mock answers (or
 * vice versa) is a valid debugging combination.
 */

export type Env = Record<string, string | undefined>;

export interface ServerConfig {
  dataSource: DataSourceKind;
  answerEngine: AnswerEngineKind;
  merge?: {
    accessKey: string;
    crmBaseUrl: string;
    ticketingBaseUrl?: string;
    accountToken: string; // single-tenant/demo token; multi-tenant resolves per org from TokenStore
  };
  gong?: {
    baseUrl: string;
    authorization: string;
  };
  claude?: {
    apiKey: string;
    model: string;
  };
  tokenEncryptionKey?: string;
}

export function resolveServerConfig(env: Env): ServerConfig {
  const dataSource = resolveDataSourceKind(env.DATA_SOURCE);
  const answerEngine = resolveAnswerEngineKind(env.ANSWER_ENGINE);

  const cfg: ServerConfig = { dataSource, answerEngine };

  if (env.MERGE_ACCESS_KEY && env.MERGE_ACCOUNT_TOKEN) {
    cfg.merge = {
      accessKey: env.MERGE_ACCESS_KEY,
      crmBaseUrl: env.MERGE_CRM_BASE_URL ?? 'https://api.merge.dev/api/crm/v1',
      ticketingBaseUrl: env.MERGE_TICKETING_BASE_URL,
      accountToken: env.MERGE_ACCOUNT_TOKEN,
    };
  }

  if (env.GONG_BASE_URL && env.GONG_AUTHORIZATION) {
    cfg.gong = { baseUrl: env.GONG_BASE_URL, authorization: env.GONG_AUTHORIZATION };
  }

  if (env.ANTHROPIC_API_KEY) {
    cfg.claude = {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL ?? 'claude-sonnet-5',
    };
  }

  cfg.tokenEncryptionKey = env.TOKEN_ENCRYPTION_KEY;
  return cfg;
}

/** Fail loudly (server startup) if a selected live mode lacks its required secrets. */
export function assertLiveConfig(cfg: ServerConfig): void {
  if (cfg.dataSource === 'live' && !cfg.merge) {
    throw new Error('DATA_SOURCE=live requires MERGE_ACCESS_KEY and MERGE_ACCOUNT_TOKEN.');
  }
  if (cfg.answerEngine === 'claude' && !cfg.claude) {
    throw new Error('ANSWER_ENGINE=claude requires ANTHROPIC_API_KEY.');
  }
}
