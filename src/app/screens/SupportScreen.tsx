import { useMemo } from 'react';
import type { EvaluatedAccount } from '../../answer';
import { PageHeader } from '../ui/PageHeader';
import { KpiTile } from '../ui/KpiTile';
import { Card } from '../ui/Card';
import { RiskBadge } from '../components/RiskBadge';
import { AccountAvatar, SeverityChip, SlaChip } from '../ui/atoms';
import { IconTicket, IconWarning, IconAlert, IconUsers } from '../ui/icons';
import { formatUsd } from '../format';
import { supportSummary, ticketsNeedingAttention, accountsPulledByTickets } from '../../support/attention';

export function SupportScreen({ book, now, onSelect }: { book: EvaluatedAccount[]; now: Date; onSelect: (id: string) => void }) {
  const summary = useMemo(() => supportSummary(book, now), [book, now]);
  const attention = useMemo(() => ticketsNeedingAttention(book, now).slice(0, 10), [book, now]);
  const pulled = useMemo(() => accountsPulledByTickets(book), [book]);

  return (
    <>
      <PageHeader title="Support & Technical Attention" subtitle="Tickets needing attention and where support strain is pulling accounts toward risk — from your help desk and Slack." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
        <KpiTile icon={<IconTicket size={18} />} tint="blue" label="Open Tickets" value={String(summary.openTotal)} sub={`across ${summary.accountsAffected} accounts`} spark={[8, 9, 9, 10, 11, 12, 13]} sparkTone="down" />
        <KpiTile icon={<IconAlert size={18} />} tint="red" label="P1 Tickets" value={String(summary.p1Total)} sub="highest severity" valueTone="red" spark={[1, 1, 2, 2, 2, 3, 3]} sparkTone="down" />
        <KpiTile icon={<IconWarning size={18} />} tint="amber" label="SLA Breached" value={String(summary.breachedTotal)} sub={`${summary.atRiskSlaTotal} more at risk`} valueTone="red" spark={[0, 1, 1, 1, 2, 2, 2]} sparkTone="down" />
        <KpiTile icon={<IconUsers size={18} />} tint="purple" label="Accounts Affected" value={String(summary.accountsAffected)} sub="have open tickets" />
        <KpiTile icon={<IconWarning size={18} />} tint="pink" label="Pulled Toward Risk" value={String(pulled.length)} sub="ticket-driven risk" valueTone="ink" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Tickets needing attention" count={attention.length} subtitle="Ranked by severity, SLA posture, and age — help-desk data only (no engineering tooling)." bodyClassName="!px-0 !pt-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Ticket</th>
                    <th className="px-3 py-2.5 font-semibold">Account</th>
                    <th className="px-3 py-2.5 font-semibold">Sev</th>
                    <th className="px-3 py-2.5 font-semibold">SLA</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map((t) => (
                    <tr key={t.ticketId} tabIndex={0} role="button" onClick={() => onSelect(t.accountId)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(t.accountId); } }}
                      className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-sunken focus-visible:bg-surface-sunken">
                      <td className="px-5 py-2.5"><span className="font-medium text-ink">{t.subject}</span>{t.tone !== 'neutral' && <span className="ml-2 text-xs text-risk-red">· {t.tone}</span>}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{t.accountName}</td>
                      <td className="px-3 py-2.5"><SeverityChip severity={t.severity} /></td>
                      <td className="px-3 py-2.5"><SlaChip status={t.slaStatus} /></td>
                      <td className="px-5 py-2.5 text-right"><span className="nums text-ink-soft">{t.ageDays}d</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Support strain pulling accounts toward risk" count={pulled.length} subtitle="Where ticket load links to a fired risk signal.">
            {pulled.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-soft">No accounts are being pulled toward risk by support load.</p>
            ) : (
              <ul className="space-y-3">
                {pulled.map((a) => (
                  <li key={a.accountId}>
                    <button type="button" onClick={() => onSelect(a.accountId)} className="w-full rounded-lg border border-line p-3 text-left hover:border-brand/40 hover:bg-brand-softer">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-medium text-ink"><AccountAvatar name={a.accountName} size="sm" />{a.accountName}</span>
                        <RiskBadge level={a.riskLevel} size="sm" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <span className="nums">{a.openTickets} open</span>
                        {a.p1Tickets > 0 && <span className="nums text-risk-red">{a.p1Tickets} P1</span>}
                        {a.breaches > 0 && <span className="nums text-risk-red">{a.breaches} SLA breach</span>}
                        <span className="text-ink-faint">· {formatUsd(a.arr)}</span>
                      </div>
                      {a.signalHeadlines.length > 0 && <p className="mt-1 text-xs text-risk-red">{a.signalHeadlines.join('; ')}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Sourced from the help desk (Zendesk / Jira Service Management / Intercom) and Slack. Deep engineering
        incident data (PagerDuty, eng Jira) is a future premium tier — not shown here.
      </p>
    </>
  );
}
