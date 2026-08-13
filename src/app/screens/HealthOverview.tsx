import { useMemo, useState } from 'react';
import type { EvaluatedAccount } from '../../answer';
import { RiskBadge } from '../components/RiskBadge';
import { Sparkline } from '../components/Sparkline';
import { formatUsd, formatDate, RISK_ORDER } from '../format';

type SortKey = 'name' | 'risk' | 'arr' | 'renewal' | 'adoption';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'name', label: 'Account', align: 'left' },
  { key: 'risk', label: 'Health', align: 'left' },
  { key: 'arr', label: 'ARR', align: 'right' },
  { key: 'adoption', label: 'Adoption', align: 'right' },
  { key: 'renewal', label: 'Renewal', align: 'right' },
];

function adoptionPct(e: EvaluatedAccount): number {
  const { activeUsers, licensedSeats } = e.account;
  return licensedSeats > 0 ? (activeUsers / licensedSeats) * 100 : 0;
}

export function HealthOverview({
  book,
  now,
  onSelect,
}: {
  book: EvaluatedAccount[];
  now: Date;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const arr = [...book];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.account.name.localeCompare(b.account.name);
          break;
        case 'risk':
          cmp = RISK_ORDER[a.evaluation.riskLevel] - RISK_ORDER[b.evaluation.riskLevel];
          if (cmp === 0) cmp = b.account.arr - a.account.arr; // within a level, biggest ARR first
          break;
        case 'arr':
          cmp = a.account.arr - b.account.arr;
          break;
        case 'renewal':
          cmp = Date.parse(a.account.renewalDate) - Date.parse(b.account.renewalDate);
          break;
        case 'adoption':
          cmp = adoptionPct(a) - adoptionPct(b);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [book, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Risk defaults to worst-first; everything else to a sensible first press.
      setSortDir(key === 'arr' ? 'desc' : 'asc');
    }
  }

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const e of book) c[e.evaluation.riskLevel]++;
    return c;
  }, [book]);

  return (
    <section aria-labelledby="overview-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="overview-heading" className="text-lg font-semibold text-ink">
            Health overview
          </h2>
          <p className="text-sm text-ink-soft">
            {book.length} accounts · {counts.red} at risk · {counts.yellow} to watch · {counts.green} healthy
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`whitespace-nowrap px-4 py-3 font-semibold ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 rounded hover:text-ink ${active ? 'text-ink' : ''} ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                    >
                      {col.label}
                      <span aria-hidden="true" className="text-[10px]">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const pct = Math.round(adoptionPct(e));
              const riskCount = e.evaluation.signals.filter((s) => s.polarity === 'risk').length;
              return (
                <tr
                  key={e.account.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelect(e.account.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onSelect(e.account.id);
                    }
                  }}
                  className="cursor-pointer border-b border-line/70 last:border-0 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{e.account.name}</div>
                    <div className="text-xs capitalize text-ink-faint">{e.account.segment.replace('_', ' ')}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge level={e.evaluation.riskLevel} size="sm" />
                    {riskCount > 0 && (
                      <span className="ml-2 text-xs text-ink-faint">
                        {riskCount} signal{riskCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{formatUsd(e.account.arr)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{pct}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{formatDate(e.account.renewalDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Sparkline history={e.account.usageHistory} current={e.account.activeUsers} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        As of {formatDate(now.toISOString())}. Select any row for the full reasoning.
      </p>
    </section>
  );
}
