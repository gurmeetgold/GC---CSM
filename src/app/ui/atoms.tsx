import type { EngagementLevel, SlaStatus, TicketSeverity } from '../../domain';

const AVATAR_TINTS = ['bg-tint-blue text-brand', 'bg-tint-purple text-[#6d4bd8]', 'bg-tint-amber text-risk-yellow', 'bg-tint-teal text-[#0f9d8f]', 'bg-tint-pink text-risk-red', 'bg-tint-green text-risk-green'];

/** A small colored logo tile with the account's initial (stands in for a real logo). */
export function AccountAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length;
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  return (
    <span className={`flex ${dim} shrink-0 items-center justify-center rounded-lg font-semibold ${AVATAR_TINTS[idx]}`} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const ENGAGEMENT_STYLE: Record<EngagementLevel, string> = {
  high: 'bg-risk-greenBg text-risk-green',
  medium: 'bg-risk-yellowBg text-risk-yellow',
  low: 'bg-risk-redBg text-risk-red',
};

export function EngagementChip({ level }: { level: EngagementLevel }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ENGAGEMENT_STYLE[level]}`}>{level}</span>;
}

const SLA_STYLE: Record<SlaStatus, { cls: string; label: string }> = {
  breached: { cls: 'bg-risk-redBg text-risk-red', label: 'SLA breached' },
  at_risk: { cls: 'bg-risk-yellowBg text-risk-yellow', label: 'SLA at risk' },
  ok: { cls: 'bg-surface-sunken text-ink-soft', label: 'On track' },
};

export function SlaChip({ status }: { status: SlaStatus }) {
  const s = SLA_STYLE[status];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const SEV_STYLE: Record<TicketSeverity, string> = {
  p1: 'bg-risk-redBg text-risk-red',
  p2: 'bg-risk-yellowBg text-risk-yellow',
  p3: 'bg-surface-sunken text-ink-soft',
};

export function SeverityChip({ severity }: { severity: TicketSeverity }) {
  return <span className={`nums inline-flex rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${SEV_STYLE[severity]}`}>{severity}</span>;
}
