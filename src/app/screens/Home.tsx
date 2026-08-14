import { useMemo } from 'react';
import type { EvaluatedAccount } from '../../answer';
import type { Route } from '../ui/AppShell';
import { PageHeader, PrimaryButton, GhostButton } from '../ui/PageHeader';
import { KpiTile } from '../ui/KpiTile';
import { Card, LinkAction } from '../ui/Card';
import { RiskBadge } from '../components/RiskBadge';
import { TrendSpark } from '../ui/charts';
import { AccountAvatar } from '../ui/atoms';
import { IconDollar, IconCalendar, IconWarning, IconTrendUp, IconAlert, IconSpark } from '../ui/icons';
import { formatUsd, formatDate, daysBetween } from '../format';
import { arrAtRisk } from '../../leadership/metrics';
import { expansionSummary } from '../../expansion/signals';

function inThisQuarter(iso: string, now: Date): boolean {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  const d = new Date(ms);
  const q = Math.floor(now.getUTCMonth() / 3);
  return d.getUTCFullYear() === now.getUTCFullYear() && Math.floor(d.getUTCMonth() / 3) === q && ms >= now.getTime();
}

function nextAction(e: EvaluatedAccount): string {
  const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
  if (e.evaluation.riskLevel === 'red') return 'Escalation call';
  if (e.evaluation.riskLevel === 'yellow') return risks[0] ? 'Review plan' : 'Check in';
  if (e.evaluation.signals.some((s) => s.type === 'growth_opportunity' || s.type === 'buying_signal')) return 'Upsell review';
  return 'Continue monitoring';
}

export function Home({
  book, now, onSelect, onAsk, onNavigate,
}: {
  book: EvaluatedAccount[];
  now: Date;
  onSelect: (id: string) => void;
  onAsk: (q: string) => void;
  onNavigate: (r: Route) => void;
}) {
  const stats = useMemo(() => {
    const totalArr = book.reduce((s, e) => s + e.account.arr, 0);
    const renewalsQ = book.filter((e) => inThisQuarter(e.account.renewalDate, now));
    const reds = book.filter((e) => e.evaluation.riskLevel === 'red');
    const exp = expansionSummary(book);
    const criticalAlerts = book.reduce((n, e) => n + e.evaluation.signals.filter((s) => s.severity === 'critical').length, 0);
    return {
      totalArr,
      renewalsQCount: renewalsQ.length,
      renewalsQArr: renewalsQ.reduce((s, e) => s + e.account.arr, 0),
      redCount: reds.length,
      arrAtRisk: arrAtRisk(book),
      exp,
      criticalAlerts,
      criticalAccounts: reds.length,
    };
  }, [book, now]);

  const reds = useMemo(
    () => book.filter((e) => e.evaluation.riskLevel === 'red').sort((a, b) => b.account.arr - a.account.arr),
    [book],
  );
  const maxRedArr = Math.max(1, ...reds.map((e) => e.account.arr));

  const actionItems = useMemo(
    () => book
      .filter((e) => e.evaluation.riskLevel !== 'green')
      .sort((a, b) => (b.evaluation.riskLevel === 'red' ? 1 : 0) - (a.evaluation.riskLevel === 'red' ? 1 : 0) || b.account.arr - a.account.arr)
      .slice(0, 4),
    [book],
  );

  return (
    <>
      <PageHeader
        title="My Portfolio"
        subtitle="AI-powered customer intelligence and next best actions."
        actions={<><GhostButton onClick={() => onAsk('summarize my book')}><IconSpark size={15} /> AI Briefing</GhostButton><PrimaryButton onClick={() => onNavigate('renewals')}>Renewals</PrimaryButton></>}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile icon={<IconDollar size={18} />} tint="blue" label="ARR Managed" value={formatUsd(stats.totalArr)} sub={`${book.length} accounts`} spark={[58, 60, 59, 62, 63, 66, 68]} sparkTone="brand" />
        <KpiTile icon={<IconCalendar size={18} />} tint="teal" label="Renewals This Quarter" value={formatUsd(stats.renewalsQArr)} sub={`${stats.renewalsQCount} renewals`} spark={[40, 44, 42, 48, 50, 52, 55]} sparkTone="up" />
        <KpiTile icon={<IconWarning size={18} />} tint="amber" label="At-Risk Accounts" value={String(stats.redCount)} sub={<span className="text-risk-red">{formatUsd(stats.arrAtRisk)} ARR</span>} valueTone="ink" spark={[3, 4, 4, 5, 6, 6, 7]} sparkTone="down" />
        <KpiTile icon={<IconTrendUp size={18} />} tint="purple" label="Expansion Signals" value={String(stats.exp.accountsWithSignals)} sub={stats.exp.crmPipelineArr > 0 ? `${formatUsd(stats.exp.crmPipelineArr)} CRM pipeline` : 'signal-based'} spark={[20, 22, 24, 23, 26, 28, 30]} sparkTone="up" />
        <KpiTile icon={<IconAlert size={18} />} tint="red" label="Open Critical Alerts" value={String(stats.criticalAlerts)} sub={`across ${stats.criticalAccounts} accounts`} valueTone="red" spark={[2, 3, 3, 4, 4, 5, 6]} sparkTone="down" />
      </div>

      {/* Main grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="My Accounts" count={book.length} action={<LinkAction onClick={() => onNavigate('accounts')}>View all →</LinkAction>} bodyClassName="!px-0 !pt-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Account</th>
                    <th className="px-3 py-2.5 font-semibold">Health</th>
                    <th className="px-3 py-2.5 font-semibold">Renewal</th>
                    <th className="px-3 py-2.5 text-right font-semibold">ARR</th>
                    <th className="px-3 py-2.5 font-semibold">Trend</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Tickets</th>
                    <th className="px-5 py-2.5 font-semibold">Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...book].sort((a, b) => rankRisk(b) - rankRisk(a) || b.account.arr - a.account.arr).slice(0, 9).map((e) => {
                    const dd = daysBetween(e.account.renewalDate, now);
                    const openT = (e.account.tickets ?? []).filter((t) => !t.resolved).length;
                    return (
                      <tr key={e.account.id} tabIndex={0} role="button"
                        onClick={() => onSelect(e.account.id)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(e.account.id); } }}
                        className="cursor-pointer border-b border-line/60 last:border-0 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <AccountAvatar name={e.account.name} size="sm" />
                            <span className="font-medium text-ink">{e.account.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><RiskBadge level={e.evaluation.riskLevel} size="sm" /></td>
                        <td className="px-3 py-2.5 text-ink-soft">
                          <div className="nums">{formatDate(e.account.renewalDate)}</div>
                          {dd !== null && dd >= 0 && <div className={`nums text-xs ${dd <= 30 ? 'text-risk-red' : 'text-ink-faint'}`}>{dd} days</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right"><span className="nums font-medium text-ink">{formatUsd(e.account.arr)}</span></td>
                        <td className="px-3 py-2.5"><TrendSpark series={e.account.trendSeries} width={64} height={24} /></td>
                        <td className="px-3 py-2.5 text-center"><span className={`nums font-medium ${openT > 0 ? 'text-ink' : 'text-ink-faint'}`}>{openT || '—'}</span></td>
                        <td className="px-5 py-2.5"><span className="text-brand">{nextAction(e)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card title="Today's AI Action Center" count={actionItems.length} action={<LinkAction onClick={() => onNavigate('accounts')}>View all →</LinkAction>}>
            <ul className="space-y-3">
              {actionItems.map((e) => {
                const top = e.evaluation.signals.filter((s) => s.polarity === 'risk')[0];
                return (
                  <li key={e.account.id}>
                    <button type="button" onClick={() => onSelect(e.account.id)} className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-softer">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{nextAction(e)}: {e.account.name}</span>
                        <RiskBadge level={e.evaluation.riskLevel} size="sm" />
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">{top ? top.headline : 'Review account health'}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Revenue at Risk" action={<span className="nums text-sm font-semibold text-risk-red">{formatUsd(stats.arrAtRisk)}</span>}>
            {reds.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-soft">No accounts at red risk. 👏</p>
            ) : (
              <ul className="space-y-2.5">
                {reds.slice(0, 6).map((e) => (
                  <li key={e.account.id}>
                    <button type="button" onClick={() => onSelect(e.account.id)} className="block w-full text-left">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-ink">{e.account.name}</span>
                        <span className="nums text-ink-soft">{formatUsd(e.account.arr)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div className="h-full rounded-full bg-risk-red/80" style={{ width: `${(e.account.arr / maxRedArr) * 100}%` }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => onNavigate('renewals')} className="mt-3 text-xs font-medium text-brand hover:text-brand-hover">View all at-risk accounts →</button>
          </Card>
        </div>
      </div>
    </>
  );
}

function rankRisk(e: EvaluatedAccount): number {
  return e.evaluation.riskLevel === 'red' ? 2 : e.evaluation.riskLevel === 'yellow' ? 1 : 0;
}
