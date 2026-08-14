import { useMemo } from 'react';
import type { EvaluatedAccount } from '../../answer';
import { PageHeader } from '../ui/PageHeader';
import { KpiTile } from '../ui/KpiTile';
import { Card } from '../ui/Card';
import { AccountAvatar } from '../ui/atoms';
import { IconTrendUp, IconDollar, IconUsers, IconSpark } from '../ui/icons';
import { formatUsd } from '../format';
import { expansionSignalRows, expansionSummary } from '../../expansion/signals';

const STRENGTH_STYLE = {
  strong: 'text-risk-green', medium: 'text-risk-yellow', weak: 'text-ink-faint', none: 'text-ink-faint',
} as const;

export function OpportunitiesScreen({ book, onSelect }: { book: EvaluatedAccount[]; onSelect: (id: string) => void }) {
  const rows = useMemo(() => expansionSignalRows(book), [book]);
  const summary = useMemo(() => expansionSummary(book), [book]);

  return (
    <>
      <PageHeader title="Expansion Signals" subtitle="Accounts showing honest expansion signals from conversations, CRM, and engagement — not a modeled score." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile icon={<IconTrendUp size={18} />} tint="purple" label="Accounts with signals" value={String(summary.accountsWithSignals)} sub="showing expansion intent" spark={[4, 5, 5, 6, 7, 8, 9]} sparkTone="up" />
        <KpiTile icon={<IconDollar size={18} />} tint="green" label="Open CRM pipeline" value={formatUsd(summary.crmPipelineArr)} sub="real CRM opportunities" valueTone="green" spark={[10, 12, 13, 15, 16, 18, 20]} sparkTone="up" />
        <KpiTile icon={<IconUsers size={18} />} tint="teal" label="Strong champions" value={String(summary.strongChampions)} sub="high engagement (Gong)" spark={[2, 3, 3, 4, 4, 5, 6]} sparkTone="up" />
        <KpiTile icon={<IconSpark size={18} />} tint="blue" label="Signal coverage" value={`${Math.round((summary.accountsWithSignals / Math.max(1, book.length)) * 100)}%`} sub="of the book" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Accounts primed for expansion" count={rows.length} bodyClassName="!px-0 !pt-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Account</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Current ARR</th>
                    <th className="px-3 py-2.5 font-semibold">Expansion signals</th>
                    <th className="px-3 py-2.5 font-semibold">Champion</th>
                    <th className="px-5 py-2.5 text-right font-semibold">CRM opp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountId} tabIndex={0} role="button" onClick={() => onSelect(r.accountId)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(r.accountId); } }}
                      className="cursor-pointer border-b border-line/60 last:border-0 align-top hover:bg-surface-sunken focus-visible:bg-surface-sunken">
                      <td className="px-5 py-3"><div className="flex items-center gap-2.5"><AccountAvatar name={r.accountName} size="sm" /><span className="font-medium text-ink">{r.accountName}</span></div></td>
                      <td className="px-3 py-3 text-right"><span className="nums text-ink">{formatUsd(r.arr)}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.signals.map((s) => <span key={s} className="rounded-full bg-tint-purple px-2 py-0.5 text-xs text-[#6d4bd8]">{s}</span>)}
                        </div>
                      </td>
                      <td className="px-3 py-3"><span className={`text-sm font-medium capitalize ${STRENGTH_STYLE[r.championStrength]}`}>{r.championStrength}</span></td>
                      <td className="px-5 py-3 text-right">{r.crmOpportunityArr !== null ? <span className="nums font-medium text-risk-green">{formatUsd(r.crmOpportunityArr)}</span> : <span className="text-xs text-ink-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="How we size expansion" subtitle="Honesty note">
            <ul className="space-y-3 text-sm text-ink-soft">
              <li className="flex gap-2"><span className="text-risk-green">✓</span> Signals come from Gong (buying language, champion strength), CRM (open opportunities), and email/calendar (new stakeholders).</li>
              <li className="flex gap-2"><span className="text-risk-green">✓</span> Dollar amounts shown are <strong className="text-ink">real CRM opportunities</strong> only.</li>
              <li className="flex gap-2"><span className="text-ink-faint">○</span> We deliberately don't show a 0–100 expansion score, a weighted pipeline, or product-usage “fit” — those need product-analytics data we don't collect yet.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
