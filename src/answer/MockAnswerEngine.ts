import type {
  AnswerEngine,
  AnswerAccountRef,
  AnswerResult,
  EvaluatedAccount,
} from './AnswerEngine';
import type { SignalType } from '../domain';

/**
 * A deterministic, rule-based answer engine over the evaluated book of business.
 * It recognizes a handful of common CSM intents by keyword and answers from the
 * computed signals — no network, no randomness. Same question → same answer.
 *
 * This is a stand-in for the future ClaudeAnswerEngine, which will honor the same
 * interface but reason far more flexibly over the same context.
 */
export class MockAnswerEngine implements AnswerEngine {
  readonly name = 'mock';

  async ask(question: string, context: EvaluatedAccount[]): Promise<AnswerResult> {
    const q = question.toLowerCase().trim();

    if (q.length === 0) {
      return {
        text: 'Ask me about your book — for example: “which accounts are at risk?”, “what’s expiring soon?”, or “where are the expansion opportunities?”',
        kind: 'unknown',
        accounts: [],
        interpretedAs: 'empty question',
      };
    }

    // 1) A specific account by name.
    const named = context.find((e) => q.includes(e.account.name.toLowerCase()));
    if (named) return this.accountDetail(named);

    // 2) Expansion / growth opportunities.
    if (matches(q, ['expansion', 'expand', 'grow', 'growth', 'upsell', 'opportunit'])) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.signals.some((s) => s.type === 'growth_opportunity'),
        'expansion opportunities',
        'accounts showing expansion signals',
      );
    }

    // 3) Renewal-focused.
    if (matches(q, ['renew', 'expir', 'expiring', 'renewal'])) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.signals.some((s) => s.type === 'renewal_risk'),
        'renewals at risk',
        'accounts renewing soon with active risk',
      );
    }

    // 4) A specific signal type mentioned.
    const signalType = detectSignalType(q);
    if (signalType) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.signals.some((s) => s.type === signalType),
        `accounts with ${humanSignal(signalType)}`,
        `accounts where ${humanSignal(signalType)} fired`,
      );
    }

    // 5) Counting. Note: "count" must be word-bounded — "accounts" contains it.
    if (matches(q, ['how many', 'number of']) || /\bcount\b/.test(q)) {
      return this.count(q, context);
    }

    // 6) Risk / red / yellow / healthy.
    if (matches(q, ['at risk', 'red', 'churn', 'danger', 'worst', 'unhealthy'])) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.riskLevel === 'red',
        'at-risk (red) accounts',
        'accounts at red risk',
      );
    }
    if (matches(q, ['yellow', 'warning', 'watch'])) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.riskLevel === 'yellow',
        'accounts to watch (yellow)',
        'accounts at yellow risk',
      );
    }
    if (matches(q, ['healthy', 'green', 'fine', 'good'])) {
      return this.byPredicate(
        context,
        (e) => e.evaluation.riskLevel === 'green',
        'healthy (green) accounts',
        'accounts at green risk',
      );
    }

    // 7) Summary / overview.
    if (matches(q, ['summary', 'overview', 'how is', 'how are', 'book', 'status'])) {
      return this.summary(context);
    }

    // Fallback: default to the most useful thing a CSM wants — the red list.
    const red = this.byPredicate(
      context,
      (e) => e.evaluation.riskLevel === 'red',
      'at-risk (red) accounts',
      'accounts at red risk',
    );
    return {
      ...red,
      text: `I wasn't sure exactly what you meant, so here are your at-risk accounts. ${red.text}`,
      interpretedAs: 'fallback → at-risk accounts',
    };
  }

  private accountDetail(e: EvaluatedAccount): AnswerResult {
    const ref = toRef(e);
    const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
    const opps = e.evaluation.signals.filter((s) => s.polarity === 'opportunity');
    let text = `${e.account.name} is ${e.evaluation.riskLevel.toUpperCase()}.`;
    if (risks.length > 0) {
      text += ` Risk signals: ${risks.map((s) => s.headline).join('; ')}.`;
    } else {
      text += ' No risk signals firing.';
    }
    if (opps.length > 0) {
      text += ` Opportunity: ${opps.map((s) => s.headline).join('; ')}.`;
    }
    return { text, kind: 'account_detail', accounts: [ref], interpretedAs: `detail for ${e.account.name}` };
  }

  private byPredicate(
    context: EvaluatedAccount[],
    pred: (e: EvaluatedAccount) => boolean,
    label: string,
    interpretedAs: string,
  ): AnswerResult {
    const matched = context.filter(pred).sort(byArrDesc);
    const refs = matched.map(toRef);
    const text =
      matched.length === 0
        ? `No ${label} right now.`
        : `${matched.length} ${label}: ${refs.map((r) => r.name).join(', ')}.`;
    return { text, kind: 'list', accounts: refs, interpretedAs };
  }

  private count(q: string, context: EvaluatedAccount[]): AnswerResult {
    const level = q.includes('red')
      ? 'red'
      : q.includes('yellow')
        ? 'yellow'
        : q.includes('green') || q.includes('healthy')
          ? 'green'
          : null;
    if (level) {
      const n = context.filter((e) => e.evaluation.riskLevel === level).length;
      return {
        text: `${n} ${level} account${n === 1 ? '' : 's'}.`,
        kind: 'count',
        accounts: [],
        interpretedAs: `count of ${level} accounts`,
      };
    }
    return {
      text: `You have ${context.length} accounts in your book.`,
      kind: 'count',
      accounts: [],
      interpretedAs: 'count of all accounts',
    };
  }

  private summary(context: EvaluatedAccount[]): AnswerResult {
    const red = context.filter((e) => e.evaluation.riskLevel === 'red');
    const yellow = context.filter((e) => e.evaluation.riskLevel === 'yellow');
    const green = context.filter((e) => e.evaluation.riskLevel === 'green');
    const growth = context.filter((e) =>
      e.evaluation.signals.some((s) => s.type === 'growth_opportunity'),
    );
    const arrAtRisk = red.reduce((sum, e) => sum + e.account.arr, 0);
    const text =
      `Book of ${context.length}: ${red.length} red, ${yellow.length} yellow, ${green.length} green. ` +
      `${formatUsd(arrAtRisk)} of ARR sits in red accounts. ` +
      `${growth.length} expansion opportunit${growth.length === 1 ? 'y' : 'ies'} in play.`;
    return {
      text,
      kind: 'summary',
      accounts: red.sort(byArrDesc).map(toRef),
      interpretedAs: 'book summary',
    };
  }
}

// --- helpers ---------------------------------------------------------------

function matches(q: string, needles: string[]): boolean {
  return needles.some((n) => q.includes(n));
}

function detectSignalType(q: string): SignalType | null {
  if (matches(q, ['usage decline', 'usage drop', 'declining usage', 'dropping usage'])) return 'usage_decline';
  if (matches(q, ['adoption', 'seats', 'utilization', 'underused', 'under-used'])) return 'adoption_gap';
  if (matches(q, ['champion', 'stakeholder', 'silent', 'silence', 'gone quiet'])) return 'champion_silence';
  if (matches(q, ['support', 'ticket', 'escalation'])) return 'support_strain';
  return null;
}

function humanSignal(type: SignalType): string {
  const map: Record<SignalType, string> = {
    usage_decline: 'usage decline',
    adoption_gap: 'an adoption gap',
    champion_silence: 'champion silence',
    renewal_risk: 'renewal risk',
    support_strain: 'support strain',
    growth_opportunity: 'a growth opportunity',
    sentiment_decline: 'a sentiment decline',
    champion_disengaging: 'a disengaging champion',
    sponsor_disengagement: 'an disengaging exec sponsor',
    competitor_mention: 'a competitor mention',
    support_sentiment: 'negative support sentiment',
    buying_signal: 'a buying signal',
    engagement_cadence: 'a drop in engagement cadence',
    email_responsiveness: 'falling email responsiveness',
    feature_depth: 'an abandoned key feature',
    stickiness_decline: 'a stickiness decline',
    onboarding_stalled: 'a stalled onboarding',
    billing_friction: 'billing friction',
  };
  return map[type];
}

function toRef(e: EvaluatedAccount): AnswerAccountRef {
  const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
  const reason =
    risks.length > 0
      ? risks.map((s) => s.headline).join('; ')
      : e.evaluation.signals.map((s) => s.headline).join('; ') || 'No signals firing';
  return { id: e.account.id, name: e.account.name, riskLevel: e.evaluation.riskLevel, reason };
}

function byArrDesc(a: EvaluatedAccount, b: EvaluatedAccount): number {
  return b.account.arr - a.account.arr;
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
