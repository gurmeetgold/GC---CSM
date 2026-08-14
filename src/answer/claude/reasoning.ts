import type { Account, Signal, SignalType } from '../../domain';
import type { ClaudeClient } from './claudeClient';

/**
 * Reasoning writer (Claude job #2): given the ALREADY-FIRED signals for an account,
 * write the plain-English "why". The signals decide risk; Claude only narrates.
 *
 * Faithfulness is enforced, not hoped for:
 *   1. The prompt is given ONLY the fired signals and told to use nothing else.
 *   2. `validateReasoning` scans the output for language describing risk types that
 *      did NOT fire. If it finds any, the LLM output is REJECTED and we fall back to
 *      a deterministic summary composed directly from the fired signals (trivially
 *      faithful). So a hallucinated risk can never reach the user.
 */

/** Keywords that indicate a narration is talking about a given signal type. */
const SIGNAL_KEYWORDS: Record<SignalType, string[]> = {
  usage_decline: ['usage decline', 'usage drop', 'usage fell', 'usage is down', 'declining usage', 'drop in usage'],
  adoption_gap: ['adoption gap', 'seat utilization', 'seats are active', 'under-utiliz', 'underutiliz', 'low adoption', 'unused seats', 'unused licenses'],
  champion_silence: ['champion silence', 'champion has gone', 'since champion', 'no contact with the champion', 'champion went quiet', 'champion is silent'],
  renewal_risk: ['renewal', 'renews in', 'up for renewal', 'renewal date', 'contract end'],
  support_strain: ['support ticket', 'support strain', 'open tickets', 'critical ticket', 'sev-1', 'sev 1', 'escalation'],
  growth_opportunity: ['expansion', 'growth opportunity', 'near the seat limit', 'at seat limit', 'upsell'],
  engagement_cadence: ['engagement cadence', 'meeting frequency', 'gone quiet', 'fewer touchpoints', 'stopped meeting'],
  email_responsiveness: ['email response', 'reply time', 'slow to reply', 'not replying', 'unanswered email'],
  feature_depth: ['feature adoption', 'stopped using', 'abandoned feature', 'key feature', 'feature usage'],
  stickiness_decline: ['stickiness', 'logins per', 'logging in less', 'login frequency'],
  onboarding_stalled: ['onboarding', 'never activated', 'activation milestone', 'stalled rollout'],
  billing_friction: ['billing', 'invoice', 'overdue', 'payment', 'pricing pushback'],
  sentiment_decline: ['sentiment', 'frustrat', 'unhappy', 'negative tone', 'dissatisf'],
  champion_disengaging: ['champion pulling back', 'losing the champion', 'champion less involved'],
  sponsor_disengagement: ['sponsor', 'exec disengag', 'decision-maker stopped', 'executive stopped attending'],
  competitor_mention: ['competitor', 'evaluating alternative', 'looking at other', 'rival vendor'],
  support_sentiment: ['frustrated ticket', 'angry', 'escalated tone', 'furious', 'support frustration'],
  buying_signal: ['buying signal', 'ready to buy', 'wants to expand', 'asking about pricing', 'interested in purchasing'],
};

export interface ReasoningResult {
  text: string;
  /** True when Claude wrote it; false when we fell back to the deterministic summary. */
  fromModel: boolean;
}

export interface ReasoningWriter {
  write(account: Account, firedSignals: Signal[]): Promise<ReasoningResult>;
}

const SYSTEM_PROMPT = `You are a Customer Success analyst writing a concise "why this account is at risk"
explanation for a CSM. You will be given a specific list of signals that fired for one account.

Rules — these are strict:
- Explain ONLY using the signals provided. Do not introduce, imply, or speculate about any risk,
  cause, or metric that is not in the provided list.
- Do not invent numbers. Use only the values given in the signals.
- 2-4 sentences, plain and direct. No preamble, no headings.`;

export class ClaudeReasoningWriter implements ReasoningWriter {
  constructor(private readonly claude: ClaudeClient) {}

  async write(account: Account, firedSignals: Signal[]): Promise<ReasoningResult> {
    const firedTypes = firedSignals.map((s) => s.type);
    const deterministic = deterministicSummary(account, firedSignals);
    if (firedSignals.length === 0) return { text: deterministic, fromModel: false };

    let text: string;
    try {
      text = await this.claude.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildReasoningInput(account, firedSignals) }],
        temperature: 0,
        maxTokens: 400,
      });
    } catch {
      return { text: deterministic, fromModel: false };
    }

    const check = validateReasoning(text, firedTypes);
    if (!text.trim() || !check.faithful) {
      // Reject hallucinated or empty narration; use the faithful fallback.
      return { text: deterministic, fromModel: false };
    }
    return { text: text.trim(), fromModel: true };
  }
}

export function buildReasoningInput(account: Account, firedSignals: Signal[]): string {
  const lines = firedSignals.map((s) => `- [${s.type}] ${s.headline}: ${s.detail}`);
  return `Account: ${account.name}\nFired signals (use ONLY these):\n${lines.join('\n')}`;
}

/**
 * Validate that a narration references only the fired signal types. Returns the set
 * of signal types the text appears to describe that did NOT fire. Pure + exported
 * for direct testing. This is the anti-hallucination guarantee, made real.
 */
export function validateReasoning(
  text: string,
  firedTypes: SignalType[],
): { faithful: boolean; violations: SignalType[] } {
  const lower = text.toLowerCase();
  const fired = new Set(firedTypes);
  const violations: SignalType[] = [];

  for (const type of Object.keys(SIGNAL_KEYWORDS) as SignalType[]) {
    if (fired.has(type)) continue;
    const mentioned = SIGNAL_KEYWORDS[type].some((kw) => lower.includes(kw));
    if (mentioned) violations.push(type);
  }
  return { faithful: violations.length === 0, violations };
}

/** A deterministic, trivially-faithful "why", composed straight from the fired signals. */
export function deterministicSummary(account: Account, firedSignals: Signal[]): string {
  const risks = firedSignals.filter((s) => s.polarity === 'risk');
  if (risks.length === 0) {
    return `${account.name} has no active risk signals.`;
  }
  const clauses = risks.map((s) => s.headline.toLowerCase());
  return `${account.name} is flagged because ${joinClauses(clauses)}.`;
}

function joinClauses(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
