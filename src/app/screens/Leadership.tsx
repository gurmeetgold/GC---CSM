import { useMemo, useState } from 'react';
import type { EvaluatedAccount } from '../../answer';
import type { RiskLevel } from '../../domain';
import { leadershipSnapshot, type LeadershipSnapshot } from '../../leadership/metrics';
import { RiskBadge } from '../components/RiskBadge';
import { formatUsd, RISK_STYLES } from '../format';

type Sub = 'overview' | 'renewals' | 'reports';

const SUBS: { key: Sub; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'renewals', label: 'Renewals' },
  { key: 'reports', label: 'Reports' },
];

export function Leadership({ book, now }: { book: EvaluatedAccount[]; now: Date }) {
  const [sub, setSub] = useState<Sub>('overview');
  const snap = useMemo(() => leadershipSnapshot(book, now), [book, now]);

  return (
    <section aria-labelledby="lead-heading">
      <div className="mb-4">
        <h2 id="lead-heading" className="text-lg font-semibold text-ink">
          Leadership
        </h2>
        <p className="text-sm text-ink-soft">Is the whole book healthy — and will we hit our numbers?</p>
      </div>

      <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Leadership views">
        {SUBS.map((s) => {
          const active = sub === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => setSub(s.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {sub === 'overview' && <Overview snap={snap} />}
      {sub === 'renewals' && <Renewals snap={snap} />}
      {sub === 'reports' && <Reports snap={snap} />}
    </section>
  );
}

// ---- Overview -------------------------------------------------------------

function Overview({ snap }: { snap: LeadershipSnapshot }) {
  const trend = snap.retention.nrrPct - 100;
  return (
    <div className="space-y-8">
      {/* Hero metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <HeroTile label="Net Revenue Retention" value={`${snap.retention.nrrPct}%`}
          sub={`${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)} pts vs. flat`} tone={trend >= 0 ? 'good' : 'bad'} />
        <HeroTile label="Gross Revenue Retention" value={`${snap.retention.grrPct}%`} sub="retention floor, before expansion" tone="neutral" />
        <HeroTile label="ARR at risk" value={formatUsd(snap.arrAtRisk)} sub={`${snap.distribution.red.count} red accounts`} tone="bad" emphasize />
      </div>

      {/* Portfolio distribution */}
      <Card title="Portfolio health" subtitle="Counts and dollars by health state — dollars are what move the number.">
        <DistributionBar snap={snap} />
      </Card>

      {/* Team & coverage */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="At-risk accounts needing coverage" subtitle="Red accounts with no recent touchpoint — where to focus support first.">
          {snap.atRiskNoActivity.length === 0 ? (
            <Empty>Every at-risk account has had recent CSM contact. 👏</Empty>
          ) : (
            <ul className="divide-y divide-line/70">
              {snap.atRiskNoActivity.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{r.name}</div>
                    <div className="text-xs text-ink-faint">{r.ownerCsm} · {r.daysSinceTouch ?? '—'}d since contact</div>
                  </div>
                  <div className="text-right tabular-nums text-sm font-medium text-ink">{formatUsd(r.arr)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Book balance by CSM" subtitle="Where to rebalance — who is carrying the most ARR and the most risk.">
          <WorkloadBars snap={snap} />
        </Card>
      </div>

      {/* Expansion */}
      <Card title="Expansion pipeline" subtitle="The positive mirror of risk — accounts bumping their limits, sized by potential ARR.">
        {snap.expansion.length === 0 ? <Empty>No expansion signals right now.</Empty> : (
          <ul className="divide-y divide-line/70">
            {snap.expansion.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="ml-2 text-xs capitalize text-ink-faint">{r.segment.replace('_', ' ')}</span>
                </div>
                <div className="text-right">
                  <div className="tabular-nums text-sm font-medium text-risk-growth">+{formatUsd(r.potentialArr)}</div>
                  <div className="text-xs text-ink-faint">on {formatUsd(r.arr)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- Renewals -------------------------------------------------------------

function Renewals({ snap }: { snap: LeadershipSnapshot }) {
  if (snap.quarterlyRenewals.length === 0) return <Empty>No upcoming renewals in the book.</Empty>;
  const maxArr = Math.max(1, ...snap.quarterlyRenewals.map((q) => q.renewingArr));
  return (
    <div className="space-y-6">
      <Card title="Renewals by quarter" subtitle="Renewing ARR per quarter, with the at-risk portion in red — where the exposure is.">
        <div className="space-y-3">
          {snap.quarterlyRenewals.map((q) => {
            const safe = q.renewingArr - q.arrAtRisk;
            return (
              <div key={q.quarter}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{q.quarter}</span>
                  <span className="nums text-xs text-ink-soft">
                    {formatUsd(q.renewingArr)}{q.arrAtRisk > 0 && <span className="text-risk-red"> · {formatUsd(q.arrAtRisk)} at risk</span>}
                  </span>
                </div>
                <div className="flex h-3 gap-0.5" style={{ width: `${(q.renewingArr / maxArr) * 100}%`, minWidth: '8%' }}>
                  {q.arrAtRisk > 0 && (
                    <div className="rounded-l-[3px] bg-risk-red" style={{ width: `${(q.arrAtRisk / q.renewingArr) * 100}%` }} title={`${formatUsd(q.arrAtRisk)} at risk`} />
                  )}
                  <div className={`bg-ink/25 ${q.arrAtRisk > 0 ? 'rounded-r-[3px]' : 'rounded-[3px]'}`} style={{ width: `${(safe / q.renewingArr) * 100}%` }} title={`${formatUsd(safe)} on track`} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {snap.quarterlyRenewals.map((q) => (
        <Card
          key={q.quarter}
          title={q.quarter}
          subtitle={`${formatUsd(q.renewingArr)} renewing · ${formatUsd(q.arrAtRisk)} at risk · ${q.redCount} red`}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-4 font-semibold">Account</th>
                  <th className="py-2 pr-4 font-semibold">Health</th>
                  <th className="py-2 pr-4 text-right font-semibold">ARR</th>
                  <th className="py-2 pr-4 text-right font-semibold">Days</th>
                  <th className="py-2 font-semibold">Why (if at risk)</th>
                </tr>
              </thead>
              <tbody>
                {q.renewals.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                    <td className="py-2.5 pr-4 font-medium text-ink">{r.name}</td>
                    <td className="py-2.5 pr-4"><RiskBadge level={r.riskLevel} size="sm" /></td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink">{formatUsd(r.arr)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink-soft">{r.daysToRenewal}</td>
                    <td className="py-2.5 text-xs text-ink-soft">
                      {r.riskLevel === 'green' ? <span className="text-ink-faint">—</span> : r.reasons.map((x) => x.headline).join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Reports --------------------------------------------------------------

function Reports({ snap }: { snap: LeadershipSnapshot }) {
  const maxReasonArr = Math.max(1, ...snap.churnReasons.map((r) => r.arr));
  return (
    <div className="space-y-6">
      <Card title="NRR / GRR by segment" subtitle="Computed from ARR movement, not a hand-built CRM report.">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-4 font-semibold">Segment</th>
              <th className="py-2 pr-4 text-right font-semibold">NRR</th>
              <th className="py-2 pr-4 text-right font-semibold">GRR</th>
              <th className="py-2 text-right font-semibold">ARR</th>
            </tr>
          </thead>
          <tbody>
            {snap.retentionBySegment.map((s) => (
              <tr key={s.segment} className="border-b border-line/60 last:border-0">
                <td className="py-2 pr-4 font-medium capitalize text-ink">{s.segment.replace('_', ' ')}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink">{s.nrrPct}%</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink-soft">{s.grrPct}%</td>
                <td className="py-2 text-right tabular-nums text-ink-soft">{formatUsd(s.arr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Churn reasons by category" subtitle="Inferred from the signals that actually fired — not a manually-populated CRM picklist.">
        <ul className="space-y-2">
          {snap.churnReasons.map((r) => (
            <li key={r.type}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-ink">{r.label} <span className="text-ink-faint">· {r.accounts}</span></span>
                <span className="tabular-nums text-ink-soft">{formatUsd(r.arr)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-risk-red/70" style={{ width: `${(r.arr / maxReasonArr) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Health distribution by CSM" subtitle="Where the team needs support — coverage, not surveillance.">
        <div className="mb-3 flex gap-4 text-xs text-ink-soft">
          {(['red', 'yellow', 'green'] as RiskLevel[]).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${RISK_STYLES[lvl].dot}`} /> {RISK_STYLES[lvl].label}
            </span>
          ))}
        </div>
        <div className="space-y-3">
          {snap.healthByCsm.map((c) => {
            const total = c.distribution.green.count + c.distribution.yellow.count + c.distribution.red.count;
            return (
              <div key={c.ownerCsm}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{c.ownerCsm}</span>
                  <span className="nums text-xs text-ink-faint">
                    {c.distribution.red.count}·{c.distribution.yellow.count}·{c.distribution.green.count} of {total}
                  </span>
                </div>
                <div className="flex h-2.5 gap-0.5">
                  {(['red', 'yellow', 'green'] as RiskLevel[]).map((lvl) =>
                    c.distribution[lvl].count > 0 ? (
                      <div key={lvl} className={`${RISK_STYLES[lvl].dot} rounded-[2px]`} style={{ width: `${(c.distribution[lvl].count / total) * 100}%` }} title={`${c.distribution[lvl].count} ${RISK_STYLES[lvl].label}`} />
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---- shared bits ----------------------------------------------------------

function HeroTile({ label, value, sub, tone, emphasize }: { label: string; value: string; sub: string; tone: 'good' | 'bad' | 'neutral'; emphasize?: boolean }) {
  const toneColor = tone === 'good' ? 'text-risk-green' : tone === 'bad' ? 'text-risk-red' : 'text-ink';
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-surface p-5 shadow-card ${emphasize ? 'border-risk-red/30 ring-1 ring-risk-red/10' : 'border-line'}`}>
      {emphasize && <div className="absolute inset-x-0 top-0 h-1 bg-risk-red" aria-hidden="true" />}
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`nums mt-1.5 ${emphasize ? 'text-hero text-risk-red' : `text-stat ${toneColor}`}`}>{value}</div>
      <div className="mt-1.5 text-xs text-ink-soft">{sub}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-ink-soft">{subtitle}</p>}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-ink-soft">{children}</p>;
}

function DistributionBar({ snap }: { snap: LeadershipSnapshot }) {
  const totalArr = snap.totalArr || 1;
  const order: RiskLevel[] = ['red', 'yellow', 'green'];
  return (
    <div>
      <div className="flex h-7 gap-0.5">
        {order.map((lvl) =>
          snap.distribution[lvl].arr > 0 ? (
            <div
              key={lvl}
              className={`${RISK_STYLES[lvl].dot} flex items-center justify-center rounded-[3px] text-[11px] font-semibold text-white first:rounded-l-lg last:rounded-r-lg`}
              style={{ width: `${(snap.distribution[lvl].arr / totalArr) * 100}%` }}
              title={`${RISK_STYLES[lvl].label}: ${formatUsd(snap.distribution[lvl].arr)}`}
            >
              {(snap.distribution[lvl].arr / totalArr) > 0.1 ? formatUsd(snap.distribution[lvl].arr) : ''}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {order.map((lvl) => (
          <div key={lvl} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${RISK_STYLES[lvl].dot}`} />
            <span className="text-ink-soft">
              <span className="font-medium text-ink">{formatUsd(snap.distribution[lvl].arr)}</span> · {snap.distribution[lvl].count} {RISK_STYLES[lvl].label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkloadBars({ snap }: { snap: LeadershipSnapshot }) {
  const maxArr = Math.max(1, ...snap.workload.map((w) => w.arr));
  return (
    <div className="space-y-3">
      {snap.workload.map((w) => (
        <div key={w.ownerCsm}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">{w.ownerCsm}</span>
            <span className="text-xs text-ink-faint">{w.accounts} accts · {formatUsd(w.arr)}{w.redArr > 0 ? ` · ${formatUsd(w.redArr)} at risk` : ''}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-ink/70" style={{ width: `${(w.arr / maxArr) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
