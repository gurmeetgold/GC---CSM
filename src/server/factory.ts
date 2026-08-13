import { createDataSource, type DataSource } from '../data';
import { HttpMergeClient, HttpGongClient } from '../data/live/httpClients';
import { createAnswerEngine, type AnswerEngine } from '../answer';
import { HttpClaudeClient } from '../answer/claude/claudeClient';
import { ClaudeSoftSignalExtractor, type SoftSignalExtractor } from '../answer/claude/softSignals';
import { ClaudeReasoningWriter, type ReasoningWriter } from '../answer/claude/reasoning';
import type { ServerConfig } from './config';

/**
 * Server-side composition root. Turns resolved config (secrets) into the concrete
 * live implementations behind the existing interfaces. This is the ONLY place
 * production secrets meet the vendor/LLM clients. Browser code never imports it.
 *
 * Everything it returns is typed as the interface (DataSource / AnswerEngine / …),
 * so callers still can't tell live from mock.
 */

export function buildDataSource(cfg: ServerConfig): DataSource {
  if (cfg.dataSource === 'mock') return createDataSource('mock');

  if (!cfg.merge) throw new Error('live data source selected but Merge config is missing.');
  const merge = new HttpMergeClient({
    baseUrl: cfg.merge.crmBaseUrl,
    accessKey: cfg.merge.accessKey,
    accountToken: cfg.merge.accountToken,
    ticketingBaseUrl: cfg.merge.ticketingBaseUrl,
  });
  const gong = cfg.gong
    ? new HttpGongClient({ baseUrl: cfg.gong.baseUrl, authorization: cfg.gong.authorization })
    : null;

  return createDataSource('live', {
    merge,
    gong,
    logger: { warn: (msg, meta) => console.warn(`[unified-api] ${msg}`, sanitize(meta)) },
  });
}

export function buildAnswerEngine(cfg: ServerConfig): AnswerEngine {
  if (cfg.answerEngine === 'mock') return createAnswerEngine('mock');
  if (!cfg.claude) throw new Error('claude answer engine selected but ANTHROPIC_API_KEY is missing.');
  const claude = new HttpClaudeClient({ apiKey: cfg.claude.apiKey, model: cfg.claude.model });
  return createAnswerEngine('claude', { claude });
}

/** The soft-signal extractor + reasoning writer are only meaningful with Claude configured. */
export function buildSoftSignalEnrichment(
  cfg: ServerConfig,
): { extractor: SoftSignalExtractor; reasoner: ReasoningWriter } | null {
  if (cfg.answerEngine !== 'claude' || !cfg.claude) return null;
  const claude = new HttpClaudeClient({ apiKey: cfg.claude.apiKey, model: cfg.claude.model });
  return {
    extractor: new ClaudeSoftSignalExtractor(claude),
    reasoner: new ClaudeReasoningWriter(claude),
  };
}

/** Strip anything token-shaped from log metadata as a belt-and-suspenders guard. */
function sanitize(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = /token|secret|key|authorization/i.test(k) ? '[redacted]' : v;
  }
  return out;
}
