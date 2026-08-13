import type {
  AnswerEngine,
  AnswerAccountRef,
  AnswerResult,
  EvaluatedAccount,
} from '../AnswerEngine';
import type { ClaudeClient } from './claudeClient';

/**
 * The real ask-anything engine (Claude-backed), honoring the SAME `AnswerEngine`
 * interface as the mock so the UI is unchanged.
 *
 * Faithfulness guardrail: Claude may phrase the answer and pick which accounts are
 * relevant, but it returns account IDS ONLY. Risk levels and reasons in the result
 * come from OUR evaluated data, never from the model — so the LLM can't misreport an
 * account's health. Unknown IDs are dropped.
 */
export class ClaudeAnswerEngine implements AnswerEngine {
  readonly name = 'claude';
  constructor(private readonly claude: ClaudeClient) {}

  async ask(question: string, context: EvaluatedAccount[]): Promise<AnswerResult> {
    const q = question.trim();
    if (!q) {
      return { text: 'Ask me anything about your book of business.', kind: 'unknown', accounts: [], interpretedAs: 'empty question' };
    }

    const byId = new Map(context.map((e) => [e.account.id, e] as const));
    const compact = context.map((e) => ({
      id: e.account.id,
      name: e.account.name,
      risk: e.evaluation.riskLevel,
      arr: e.account.arr,
      signals: e.evaluation.signals.map((s) => s.type),
    }));

    let raw: string;
    try {
      raw = await this.claude.complete({
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Book of business (JSON):\n${JSON.stringify(compact)}\n\nQuestion: ${q}` },
        ],
        temperature: 0,
        maxTokens: 700,
      });
    } catch {
      return { text: 'The answer service is temporarily unavailable. Please try again.', kind: 'unknown', accounts: [], interpretedAs: 'claude unavailable' };
    }

    const parsed = parseAnswer(raw);
    const accounts: AnswerAccountRef[] = parsed.accountIds
      .map((id) => byId.get(id))
      .filter((e): e is EvaluatedAccount => Boolean(e))
      .map(toRef);

    return {
      text: parsed.text || 'No answer produced.',
      kind: accounts.length > 0 ? 'list' : 'summary',
      accounts,
      interpretedAs: 'claude',
    };
  }
}

const SYSTEM_PROMPT = `You are a Customer Success analyst answering a CSM's question about their book of business.
You are given the book as JSON (each account has id, name, risk, arr, and the signal types that fired).

Return ONLY a JSON object (no markdown, no prose outside it):
{ "text": "<plain-English answer, 1-3 sentences>", "accountIds": ["<id>", ...] }

Rules:
- Base the answer ONLY on the provided data. Do not invent accounts, risks, or numbers.
- "accountIds" must be a subset of the ids in the data, ordered by relevance.
- If no accounts are relevant, return an empty accountIds array.`;

interface ParsedAnswer {
  text: string;
  accountIds: string[];
}

export function parseAnswer(raw: string): ParsedAnswer {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return { text: raw.trim(), accountIds: [] };
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const text = typeof obj.text === 'string' ? obj.text : '';
    const ids = Array.isArray(obj.accountIds)
      ? obj.accountIds.filter((x): x is string => typeof x === 'string')
      : [];
    return { text, accountIds: ids };
  } catch {
    return { text: raw.trim(), accountIds: [] };
  }
}

function toRef(e: EvaluatedAccount): AnswerAccountRef {
  const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
  const reason = risks.length > 0
    ? risks.map((s) => s.headline).join('; ')
    : e.evaluation.signals.map((s) => s.headline).join('; ') || 'No signals firing';
  return { id: e.account.id, name: e.account.name, riskLevel: e.evaluation.riskLevel, reason };
}
