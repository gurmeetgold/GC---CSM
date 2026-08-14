import type { EvaluatedAccount } from '../../answer';
import type { Signal } from '../../domain';
import { Card } from '../ui/Card';
import { RiskBadge } from '../components/RiskBadge';
import { AccountAvatar, EngagementChip, SeverityChip, SlaChip } from '../ui/atoms';
import { TrendSpark } from '../ui/charts';
import { PrimaryButton } from '../ui/PageHeader';
import { formatUsd, formatDate, daysBetween } from '../format';

const SEV_IMPACT: Record<Signal['severity'], { label: string; cls: string }> = {
  critical: { label: 'High', cls: 'text-risk-red' },
  warning: { label: 'Medium', cls: 'text-risk-yellow' },
  info: { label: 'Low', cls: 'text-ink-faint' },
};

const KIND_DOT: Record<string, string> = { call: 'bg-brand', email: 'bg-risk-growth', meeting: 'bg-[#6d4bd8]', support: 'bg-risk-red' };

export function AccountDetail({
  e, now, reasoning, onBack,
}: {
  e: EvaluatedAccount;
  now: Date;
  reasoning?: string;
  onBack: () => void;
}) {
  const a = e.account;
  const risks = e.evaluation.signals.filter((s) => s.polarity === 'risk');
  const opps = e.evaluation.signals.filter((s) => s.polarity === 'opportunity');
  const dd = daysBetween(a.renewalDate, now);
  const openTickets = (a.tickets ?? []).filter((t) => !t.resolved);
  const champion = (a.contacts ?? []).find((c) => c.isChampion);
  const timeline = [...(a.interactions ?? [])].sort((x, y) => Date.parse(y.occurredAt) - Date.parse(x.occurredAt)).slice(0, 8);

  const engagement = champion?.engagement ?? 'low';
  const supportLevel: 'red' | 'yellow' | 'green' = openTickets.some((t) => t.severity === 'p1' || t.slaStatus === 'breached') ? 'red' : openTickets.length > 3 ? 'yellow' : 'green';

  return (
    <>
      {/* Breadcrumb + header */}
      <button type="button" onClick={onBack} className="mb-3 text-sm text-ink-soft hover:text-ink">← Accounts</button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AccountAvatar name={a.name} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{a.name}</h1>
              <RiskBadge level={e.evaluation.riskLevel} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
              <span>Owner · <span className="text-ink">{a.ownerCsm}</span></span>
              <span>ARR · <span className="nums text-ink">{formatUsd(a.arr)}</span></span>
              <span>Renewal · <span className="nums text-ink">{formatDate(a.renewalDate)}</span>{dd !== null && dd >= 0 && <span className={dd <= 30 ? 'text-risk-red' : 'text-ink-faint'}> ({dd} days)</span>}</span>
            </div>
          </div>
        </div>
        <PrimaryButton>Take Action</PrimaryButton>
      </div>

      {/* Metric tiles — honest, qualitative (no faked 0–100 warehouse scores) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile label="Renewal Risk" level={e.evaluation.riskLevel} value={e.evaluation.riskLevel === 'red' ? 'Critical' : e.evaluation.riskLevel === 'yellow' ? 'At Risk' : 'Healthy'} sub={dd !== null && dd >= 0 ? `renews in ${dd}d` : 'no near renewal'} spark={a.trendSeries} />
        <MetricTile label="Engagement" tone={engagement} value={cap(engagement)} sub="from calls + email" />
        <MetricTile label="Support Health" tone={supportLevel === 'red' ? 'low' : supportLevel === 'yellow' ? 'medium' : 'high'} value={supportLevel === 'red' ? 'Strained' : supportLevel === 'yellow' ? 'Busy' : 'Healthy'} sub={`${openTickets.length} open tickets`} />
        <MetricTile label="Exec Engagement" tone={engagement} value={cap(engagement)} sub={champion ? champion.name : 'no champion'} />
        <MetricTile label="Expansion Signal" tone={opps.length > 0 ? 'high' : 'low'} value={opps.length > 0 ? 'Present' : 'None'} sub={a.opportunities.some((o) => o.isExpansion) ? formatUsd(a.opportunities.filter((o) => o.isExpansion).reduce((s, o) => s + o.amount, 0)) + ' CRM opp' : 'signal-based'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Why + timeline */}
        <div className="space-y-4 xl:col-span-2">
          <Card title={e.evaluation.riskLevel === 'red' ? 'Why this account turned red' : 'Account health reasoning'} subtitle="Health reasoning">
            {reasoning && <p className="mb-4 rounded-lg bg-surface-sunken px-4 py-3 text-sm leading-relaxed text-ink">{reasoning}</p>}
            {risks.length === 0 ? (
              <p className="text-sm text-ink-soft">No risk signals are firing for this account.</p>
            ) : (
              <ol className="space-y-2.5">
                {risks.map((s, i) => (
                  <li key={s.type} className="flex gap-3">
                    <span className="nums mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-risk-redBg text-xs font-semibold text-risk-red">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{s.headline}</span>
                        <span className={`text-xs font-semibold ${SEV_IMPACT[s.severity].cls}`}>{SEV_IMPACT[s.severity].label} impact</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-soft">{s.detail}</p>
                      {typeof s.evidence.quote === 'string' && <p className="mt-1 text-xs italic text-ink-faint">“{s.evidence.quote}”</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="90-day account timeline" subtitle="Calls, emails, meetings and support contacts (CRM + Gong + email + help desk).">
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-soft">No recorded interactions in the window.</p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[i.kind] ?? 'bg-ink-faint'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm capitalize text-ink">{i.kind}</span>
                        <span className="nums text-xs text-ink-faint">{formatDate(i.occurredAt)}</span>
                      </div>
                      <p className="text-sm text-ink-soft">{i.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Stakeholders + tickets */}
        <div className="space-y-4">
          <Card title="Open tickets" count={openTickets.length}>
            {openTickets.length === 0 ? (
              <p className="text-sm text-ink-soft">No open tickets.</p>
            ) : (
              <ul className="space-y-2.5">
                {openTickets.map((t) => (
                  <li key={t.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{t.subject}</span>
                      <SeverityChip severity={t.severity} />
                    </div>
                    <div className="mt-1 flex items-center gap-2"><SlaChip status={t.slaStatus} />{t.tone !== 'neutral' && <span className="text-xs text-risk-red">{t.tone} tone</span>}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Key stakeholders" count={a.contacts?.length ?? 0}>
            <ul className="divide-y divide-line/70">
              {(a.contacts ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-ink">{c.name}{c.isChampion && <span title="Champion" className="text-risk-green">★</span>}</div>
                    <div className="text-xs text-ink-faint">{c.title}{c.lastContactedAt && ` · ${relDays(c.lastContactedAt, now)}`}</div>
                  </div>
                  <EngagementChip level={c.engagement} />
                </li>
              ))}
            </ul>
          </Card>

          {opps.length > 0 && (
            <Card title="Expansion signal">
              <ul className="space-y-1.5 text-sm text-ink-soft">
                {opps.map((s) => <li key={s.type} className="flex gap-2"><span className="text-risk-growth">↗</span> {s.headline}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function MetricTile({ label, value, sub, level, tone, spark }: { label: string; value: string; sub: string; level?: 'red' | 'yellow' | 'green'; tone?: 'low' | 'medium' | 'high'; spark?: number[] }) {
  const color =
    level === 'red' || tone === 'low' ? 'text-risk-red'
      : level === 'yellow' || tone === 'medium' ? 'text-risk-yellow'
        : level === 'green' || tone === 'high' ? 'text-risk-green' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        {spark && spark.length >= 2 && <TrendSpark series={spark} width={56} height={22} />}
      </div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>
    </div>
  );
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function relDays(iso: string, now: Date): string {
  const d = daysBetween(iso, now);
  if (d === null) return '';
  const n = Math.abs(d);
  return n === 0 ? 'today' : `${n}d ago`;
}
