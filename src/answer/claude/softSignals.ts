import type { Account, Signal, SignalSeverity, SoftSignalType } from '../../domain';
import type { ClaudeClient } from './claudeClient';

/**
 * Soft-signal extraction (Claude job #1).
 *
 * Feeds recent call/email text to Claude and gets back TYPED soft signals in the
 * same `Signal` shape as hard signals. This is the ONLY channel by which LLM output
 * can affect RiskLevel, and it is heavily constrained:
 *   - Output must be strict JSON matching a fixed enum; anything else is dropped.
 *   - Risk-polarity soft signals are severity-CLAMPED to 'warning' — a soft signal
 *     can contribute to red only by STACKING, never single-handedly. The LLM can
 *     never mint a solo 'critical'. (Revisit: PHASE2_SIGNAL_PROPOSALS.md.)
 *   - We never persist the raw transcript text (see DATA_HANDLING.md).
 */

const SOFT_TYPES: Record<SoftSignalType, { polarity: 'risk' | 'opportunity'; label: string }> = {
  sentiment_decline: { polarity: 'risk', label: 'Sentiment decline' },
  champion_disengaging: { polarity: 'risk', label: 'Champion disengaging' },
  competitor_mention: { polarity: 'risk', label: 'Competitor mention' },
  buying_signal: { polarity: 'opportunity', label: 'Buying signal' },
};

const SYSTEM_PROMPT = `You are a signal-extraction component in a Customer Success system.
You read recent customer interaction text (call summaries, emails) for ONE account and
identify soft relationship signals.

Return ONLY a JSON array (no prose, no markdown fences). Each element must be:
{
  "type": one of ["sentiment_decline","champion_disengaging","competitor_mention","buying_signal"],
  "severity": one of ["info","warning"],
  "headline": short (<= 8 words),
  "detail": one sentence grounded in the text,
  "quote": a short verbatim snippet from the input that supports it
}

Rules:
- Only emit a signal you can support with a specific snippet from the input. If nothing
  is clearly present, return [].
- Do NOT infer hard metrics (usage, seats, tickets, renewal dates) — those are computed
  elsewhere. Only relationship/qualitative signals.
- Never invent content that is not in the input.`;

export interface SoftSignalExtractor {
  extract(account: Account): Promise<Signal[]>;
}

export class ClaudeSoftSignalExtractor implements SoftSignalExtractor {
  constructor(private readonly claude: ClaudeClient) {}

  async extract(account: Account): Promise<Signal[]> {
    const text = buildInteractionText(account);
    if (text.trim().length === 0) return []; // no Gong/email data → no soft signals (SFDC-only account)

    let raw: string;
    try {
      raw = await this.claude.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Account: ${account.name}\n\nRecent interactions:\n${text}` }],
        temperature: 0,
        maxTokens: 1024,
      });
    } catch {
      // LLM unavailable → degrade to no soft signals; hard signals still stand.
      return [];
    }

    return parseSoftSignals(raw);
  }
}

/** Build the interaction text block from an account's interactions (bounded). */
export function buildInteractionText(account: Account, maxItems = 25): string {
  return (account.interactions ?? [])
    .slice(0, maxItems)
    .map((i) => `- (${i.kind}, ${i.occurredAt || 'undated'}) ${i.summary}`)
    .join('\n');
}

/**
 * Parse and VALIDATE the model output into typed soft signals. Pure and defensive:
 * strips fences, tolerates junk, drops any element that doesn't match the schema,
 * clamps severity, and never throws. Exported for direct unit testing.
 */
export function parseSoftSignals(raw: string): Signal[] {
  const jsonText = stripToJsonArray(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Signal[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const type = rec.type;
    if (typeof type !== 'string' || !(type in SOFT_TYPES)) continue;
    const meta = SOFT_TYPES[type as SoftSignalType];

    const headline = typeof rec.headline === 'string' && rec.headline.trim() ? rec.headline.trim() : meta.label;
    const detail = typeof rec.detail === 'string' ? rec.detail.trim() : '';
    const quote = typeof rec.quote === 'string' ? rec.quote.trim() : '';

    // Clamp severity: risk soft signals never exceed 'warning'; opportunities are 'info'.
    const requested = rec.severity;
    let severity: SignalSeverity;
    if (meta.polarity === 'opportunity') severity = 'info';
    else severity = requested === 'warning' ? 'warning' : requested === 'info' ? 'info' : 'warning';

    const evidence: Record<string, number | string> = {};
    if (quote) evidence.quote = quote.slice(0, 240);

    out.push({
      type: type as SoftSignalType,
      polarity: meta.polarity,
      severity,
      headline: headline.slice(0, 80),
      detail: detail || meta.label,
      evidence,
      source: 'soft',
    });
  }
  return out;
}

/** Extract the first top-level JSON array from a possibly-fenced/prose-wrapped string. */
function stripToJsonArray(raw: string): string {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return '[]';
  return raw.slice(start, end + 1);
}
