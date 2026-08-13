import { useEffect, useRef } from 'react';
import type { EvaluatedAccount } from '../../answer';
import type { Signal } from '../../domain';
import { RiskBadge } from '../components/RiskBadge';
import { formatUsd, formatDate, daysBetween } from '../format';

const SEVERITY_STYLE: Record<Signal['severity'], string> = {
  critical: 'border-l-risk-red bg-risk-redBg/50',
  warning: 'border-l-risk-yellow bg-risk-yellowBg/50',
  info: 'border-l-risk-growth bg-risk-growthBg/50',
};

function SignalRow({ signal }: { signal: Signal }) {
  return (
    <li className={`rounded-r-md border-l-[3px] px-3 py-2 ${SEVERITY_STYLE[signal.severity]}`}>
      <p className="text-sm font-medium text-ink">{signal.headline}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{signal.detail}</p>
    </li>
  );
}

function AccountCard({ e, highlight }: { e: EvaluatedAccount; highlight: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ref.current.focus({ preventScroll: true });
    }
  }, [highlight]);

  const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
  const opportunities = e.evaluation.signals.filter((s) => s.polarity === 'opportunity');
  const toRenewal = daysBetween(e.account.renewalDate, new Date(e.evaluation.evaluatedAt));

  return (
    <article
      ref={ref}
      tabIndex={-1}
      id={`account-${e.account.id}`}
      className={`scroll-mt-24 rounded-xl border bg-surface p-5 shadow-sm transition-shadow ${
        highlight ? 'border-risk-red ring-2 ring-risk-red/30' : 'border-line'
      }`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{e.account.name}</h3>
            <RiskBadge level={e.evaluation.riskLevel} size="sm" />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {formatUsd(e.account.arr)} ARR · <span className="capitalize">{e.account.segment.replace('_', ' ')}</span> ·{' '}
            Renews {formatDate(e.account.renewalDate)}
            {toRenewal !== null && toRenewal >= 0 && toRenewal <= 90 && (
              <span className="ml-1 font-medium text-risk-red">({toRenewal}d)</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-ink">
            {e.account.activeUsers}
            <span className="text-base font-normal text-ink-faint">/{e.account.licensedSeats}</span>
          </div>
          <div className="text-xs text-ink-faint">active / licensed</div>
        </div>
      </header>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Why this account is at risk
        </h4>
        <ul className="space-y-2">
          {risks.map((s) => (
            <SignalRow key={s.type} signal={s} />
          ))}
        </ul>
      </div>

      {opportunities.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Also worth noting
          </h4>
          <ul className="space-y-2">
            {opportunities.map((s) => (
              <SignalRow key={s.type} signal={s} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function RedAccounts({
  book,
  focusId,
}: {
  book: EvaluatedAccount[];
  focusId: string | null;
}) {
  const reds = book
    .filter((e) => e.evaluation.riskLevel === 'red')
    .sort((a, b) => b.account.arr - a.account.arr);

  const arrAtRisk = reds.reduce((sum, e) => sum + e.account.arr, 0);

  if (reds.length === 0) {
    return (
      <section aria-labelledby="red-heading">
        <h2 id="red-heading" className="text-lg font-semibold text-ink">
          At-risk accounts
        </h2>
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-risk-greenBg text-risk-green">
            ✓
          </div>
          <p className="font-medium text-ink">No accounts are at risk right now.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Every account is green or yellow. Check the Health overview to keep an eye on the yellows before
            they slip.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="red-heading">
      <div className="mb-5">
        <h2 id="red-heading" className="text-lg font-semibold text-ink">
          At-risk accounts
        </h2>
        <p className="text-sm text-ink-soft">
          {reds.length} account{reds.length === 1 ? '' : 's'} need attention ·{' '}
          <span className="font-medium text-risk-red">{formatUsd(arrAtRisk)} ARR at risk</span>
        </p>
      </div>
      <div className="grid gap-4">
        {reds.map((e) => (
          <AccountCard key={e.account.id} e={e} highlight={focusId === e.account.id} />
        ))}
      </div>
    </section>
  );
}
