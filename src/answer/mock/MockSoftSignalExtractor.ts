import type { Account, Signal, SoftSignalType } from '../../domain';
import type { SoftSignalExtractor } from '../claude/softSignals';

/**
 * Deterministic soft-signal extractor for the mock / demo path — the language-read
 * analogue of MockAnswerEngine. It reads interaction summaries (and ticket wording)
 * for grounded triggers and emits the SAME typed soft `Signal`s the Claude extractor
 * would, so the browser demo shows hard + soft stacking with ZERO credentials.
 *
 * Every emitted signal is grounded in a specific interaction (carried as its
 * evidence "quote"), risk signals are clamped to `warning` (an LLM/soft signal can
 * never solo-red an account), and an account with no interactions yields nothing —
 * the same graceful-degradation contract as the live extractor.
 */

interface Rule {
  type: SoftSignalType;
  polarity: 'risk' | 'opportunity';
  test: (summary: string, kind: string) => boolean;
  headline: string;
  detail: (quote: string) => string;
}

const RULES: Rule[] = [
  {
    type: 'competitor_mention',
    polarity: 'risk',
    test: (s) => /\b(competitor|rival|alternative vendor|evaluating (a|an|another))\b/i.test(s),
    headline: 'Competitor mentioned',
    detail: (q) => `A competitor came up in conversation: “${q}”`,
  },
  {
    type: 'sponsor_disengagement',
    polarity: 'risk',
    test: (s) => /\b(sponsor|exec(utive)?)\b/i.test(s) && /\b(stopped|no longer|dismissive|disengag|skipp|not join)/i.test(s),
    headline: 'Exec sponsor disengaging',
    detail: (q) => `The executive sponsor appears to be pulling back: “${q}”`,
  },
  {
    type: 'support_sentiment',
    polarity: 'risk',
    test: (s, kind) => kind === 'support' && /\b(furious|angry|frustrat|escalat|threat)/i.test(s),
    headline: 'Frustration in support tone',
    detail: (q) => `Support wording shows real frustration: “${q}”`,
  },
  {
    type: 'sentiment_decline',
    polarity: 'risk',
    test: (s, kind) => kind !== 'support' && /\b(frustrat|unhappy|disappointed|dissatisf|negative|concerned)\b/i.test(s),
    headline: 'Sentiment trending negative',
    detail: (q) => `Tone has turned negative: “${q}”`,
  },
  {
    type: 'buying_signal',
    polarity: 'opportunity',
    test: (s) => /\b(wants to expand|additional seats|add seats|asked about .*pricing|pricing to expand|more licenses)\b/i.test(s),
    headline: 'Expansion intent',
    detail: (q) => `Positive buying signal: “${q}”`,
  },
];

export class MockSoftSignalExtractor implements SoftSignalExtractor {
  async extract(account: Account): Promise<Signal[]> {
    const interactions = account.interactions ?? [];
    if (interactions.length === 0) return [];

    const out: Signal[] = [];
    const seen = new Set<SoftSignalType>();

    for (const rule of RULES) {
      if (seen.has(rule.type)) continue;
      const hit = interactions.find((i) => rule.test(i.summary ?? '', i.kind));
      if (!hit) continue;
      seen.add(rule.type);
      out.push({
        type: rule.type,
        polarity: rule.polarity,
        severity: rule.polarity === 'opportunity' ? 'info' : 'warning', // clamped: never critical
        headline: rule.headline,
        detail: rule.detail(hit.summary),
        evidence: { quote: hit.summary.slice(0, 240), source: hit.kind },
        source: 'soft',
      });
    }
    return out;
  }
}
