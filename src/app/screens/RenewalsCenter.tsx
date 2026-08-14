import { useMemo } from 'react';
import type { EvaluatedAccount } from '../../answer';
import { PageHeader } from '../ui/PageHeader';
import { KpiTile } from '../ui/KpiTile';
import { Card } from '../ui/Card';
import { RiskBadge } from '../components/RiskBadge';
import { AccountAvatar } from '../ui/atoms';
import { TrendSpark } from '../ui/charts';
import { IconDollar, IconCalendar, IconWarning, IconShield } from '../ui/icons';
import { formatUsd, formatDate, daysBetween } from '../format';
import { quarterlyRenewals, arrAtRisk } from '../../leadership/metrics';

export function RenewalsCenter({
  book, now, onSelect,
}: {
  book: EvaluatedAccount[];
  now: Date;
  onSelect: (id: string) => void;
}) {
  const kpis = useMemo(() => {
    const within = (days: number) => book.filter((e) => {
      const d = daysBetween(e.account.renewalDate, now);
      return d !== null && d >= 0 && d <= days;
    });
    const w30 = within(30), w60 = within(60), w90 = within(90);
    const sum = (arr: EvaluatedAccount[]) => arr.reduce((s, e) => s + e.account.arr, 0);
    return {
      arrAtRisk: arrAtRisk(book),
      redCount: book.filter((e) => e.evaluation.riskLevel === 'red').length,
      w30: { n: w30.length, arr: sum(w30) },
      w60: { n: w60.length, arr: sum(w60) },
      w90: { n: w90.length, arr: sum(w90) },
    };
  }, [book, now]);

  const quarters = useMemo(() => quarterlyRenewals(book, now), [book, now]);
  const maxQ = Math.max(1, ...quarters.map((q) => q.renewingArr));

  // Near-term at-risk renewals (yellow/red within 120 days), sorted risk × dollars.
  const atRisk = useMemo(() => {
    const rows = book
      .map((e) => ({ e, d: daysBetween(e.account.renewalDate, now) }))
      .filter((x) => x.d !== null && x.d >= 0 && x.d <= 120 && x.e.evaluation.riskLevel !== 'green')
      .sort((a, b) => rank(b.e) * b.e.account.arr - rank(a.e) * a.e.account.arr);
    return rows;
  }, [book, now]);

  return (
    <>
      <PageHeader title="Renewals & Risk Center" subtitle="Protect revenue by acting on at-risk accounts and upcoming renewals." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile icon={<IconDollar size={18} />} tint="red" label="Revenue at Risk" value={formatUsd(kpis.arrAtRisk)} sub={`${kpis.redCount} red accounts`} valueTone="red" spark={[3, 4, 4, 5, 5, 6, 6]} sparkTone="down" />
        <KpiTile icon={<IconCalendar size={18} />} tint="blue" label="Renewals in 30 Days" value={formatUsd(kpis.w30.arr)} sub={`${kpis.w30.n} accounts`} spark={[1, 2, 2, 3, 3, 4, 5]} sparkTone="brand" />
        <KpiTile icon={<IconCalendar size={18} />} tint="amber" label="Renewals in 60 Days" value={formatUsd(kpis.w60.arr)} sub={`${kpis.w60.n} accounts`} spark={[3, 4, 5, 5, 6, 7, 8]} sparkTone="brand" />
        <KpiTile icon={<IconCalendar size={18} />} tint="purple" label="Renewals in 90 Days" value={formatUsd(kpis.w90.arr)} sub={`${kpis.w90.n} accounts`} spark={[5, 6, 7, 8, 9, 10, 11]} sparkTone="brand" />
        <KpiTile icon={<IconShield size={18} />} tint="green" label="Book Coverage" value={`${Math.round((book.filter((e) => e.evaluation.riskLevel === 'green').length / Math.max(1, book.length)) * 100)}%`} sub="accounts healthy" valueTone="green" spark={[60, 62, 63, 64, 66, 67, 68]} sparkTone="up" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="At-risk & near-term renewals" count={atRisk.length} bodyClassName="!px-0 !pt-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Account</th>
                    <th className="px-3 py-2.5 font-semibold">Renewal</th>
                    <th className="px-3 py-2.5 text-right font-semibold">ARR</th>
                    <th className="px-3 py-2.5 font-semibold">Health</th>
                    <th className="px-3 py-2.5 font-semibold">Trend</th>
                    <th className="px-5 py-2.5 font-semibold">Top risk driver</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map(({ e, d }) => {
                    const driver = e.evaluation.signals.filter((s) => s.polarity === 'risk')[0];
                    return (
                      <tr key={e.account.id} tabIndex={0} role="button" onClick={() => onSelect(e.account.id)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(e.account.id); } }}
                        className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-sunken focus-visible:bg-surface-sunken">
                        <td className="px-5 py-2.5"><div className="flex items-center gap-2.5"><AccountAvatar name={e.account.name} size="sm" /><span className="font-medium text-ink">{e.account.name}</span></div></td>
                        <td className="px-3 py-2.5"><div className="nums text-ink-soft">{formatDate(e.account.renewalDate)}</div><div className={`nums text-xs ${d !== null && d <= 30 ? 'text-risk-red' : 'text-ink-faint'}`}>{d} days</div></td>
                        <td className="px-3 py-2.5 text-right"><span className="nums font-medium text-ink">{formatUsd(e.account.arr)}</span></td>
                        <td className="px-3 py-2.5"><RiskBadge level={e.evaluation.riskLevel} size="sm" /></td>
                        <td className="px-3 py-2.5"><TrendSpark series={e.account.trendSeries} width={60} height={22} /></td>
                        <td className="px-5 py-2.5 text-ink-soft">{driver ? driver.headline : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Renewals by quarter" subtitle="Renewing ARR per quarter; at-risk portion in red.">
            <div className="space-y-3">
              {quarters.map((q) => {
                const safe = q.renewingArr - q.arrAtRisk;
                return (
                  <div key={q.quarter}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{q.quarter}</span>
                      <span className="nums text-xs text-ink-soft">{formatUsd(q.renewingArr)}{q.arrAtRisk > 0 && <span className="text-risk-red"> · {formatUsd(q.arrAtRisk)}</span>}</span>
                    </div>
                    <div className="flex h-3 gap-0.5" style={{ width: `${(q.renewingArr / maxQ) * 100}%`, minWidth: '10%' }}>
                      {q.arrAtRisk > 0 && <div className="rounded-l-[3px] bg-risk-red" style={{ width: `${(q.arrAtRisk / q.renewingArr) * 100}%` }} />}
                      <div className={`bg-brand/30 ${q.arrAtRisk > 0 ? 'rounded-r-[3px]' : 'rounded-[3px]'}`} style={{ width: `${(safe / q.renewingArr) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Today's priority alerts" count={atRisk.filter((x) => x.e.evaluation.riskLevel === 'red').length}>
            <ul className="space-y-2.5">
              {atRisk.filter((x) => x.e.evaluation.riskLevel === 'red').slice(0, 5).map(({ e, d }) => (
                <li key={e.account.id}>
                  <button type="button" onClick={() => onSelect(e.account.id)} className="w-full rounded-lg bg-risk-redBg/60 p-3 text-left hover:bg-risk-redBg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{e.account.name} renews in {d}d</span>
                      <IconWarning size={15} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">{formatUsd(e.account.arr)} ARR · {e.evaluation.signals.find((s) => s.polarity === 'risk')?.headline ?? 'at risk'}</p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function rank(e: EvaluatedAccount): number {
  return e.evaluation.riskLevel === 'red' ? 2 : e.evaluation.riskLevel === 'yellow' ? 1 : 0.5;
}
