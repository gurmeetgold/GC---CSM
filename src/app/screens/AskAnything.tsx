import { useEffect, useState } from 'react';
import type { AnswerEngine, AnswerResult, EvaluatedAccount } from '../../answer';
import { RiskBadge } from '../components/RiskBadge';
import { PageHeader } from '../ui/PageHeader';

const SUGGESTIONS = [
  'Which accounts are at risk?',
  'What renewals are at risk?',
  'Where are the expansion opportunities?',
  'Which accounts have a champion gone quiet?',
  'Give me a summary of my book',
];

export function AskAnything({
  book,
  onSelect,
  engine,
  seed,
}: {
  book: EvaluatedAccount[];
  onSelect: (id: string) => void;
  /** Injected from the composition point; a ClaudeAnswerEngine swaps in with zero UI change. */
  engine: AnswerEngine;
  /** A question seeded from the top-bar search; asked automatically. */
  seed?: string;
}) {
  const answerEngine = engine;
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [pending, setPending] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setPending(true);
    const res = await answerEngine.ask(text, book);
    setResult(res);
    setPending(false);
  }

  useEffect(() => {
    if (seed && seed.trim()) void ask(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <section aria-labelledby="ask-heading" className="mx-auto max-w-2xl">
      <PageHeader title="Ask anything" subtitle="Ask a question about your book in plain language. Answers come from the same computed signals you see across the app." />

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void ask(question);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(ev) => setQuestion(ev.target.value)}
          placeholder="e.g. which accounts are at risk?"
          aria-label="Ask a question about your book"
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-brand"
        />
        <button
          type="submit"
          disabled={pending || question.trim().length === 0}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void ask(s)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-card">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
            Interpreted as: {result.interpretedAs}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{result.text}</p>

          {result.accounts.length > 0 && (
            <ul className="mt-4 divide-y divide-line/70">
              {result.accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-ink"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-xs text-ink-faint">{a.reason}</span>
                    </span>
                    <RiskBadge level={a.riskLevel} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!result && (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface/60 p-8 text-center text-sm text-ink-soft">
          Try a question above, or tap a suggestion to get started.
        </div>
      )}
    </section>
  );
}
