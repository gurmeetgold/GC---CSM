import type { ReactNode } from 'react';
import { TrendSpark } from './charts';

export type TileTint = 'blue' | 'purple' | 'amber' | 'teal' | 'pink' | 'green' | 'red';

const TINT_BG: Record<TileTint, string> = {
  blue: 'bg-tint-blue text-brand',
  purple: 'bg-tint-purple text-[#6d4bd8]',
  amber: 'bg-tint-amber text-risk-yellow',
  teal: 'bg-tint-teal text-[#0f9d8f]',
  pink: 'bg-tint-pink text-risk-red',
  green: 'bg-tint-green text-risk-green',
  red: 'bg-tint-red text-risk-red',
};

/**
 * The signature KPI tile: soft-tinted icon chip · label · hero number · optional
 * sub-line · optional trend sparkline. The value is the hero — big, tight, tabular.
 */
export function KpiTile({
  icon,
  tint,
  label,
  value,
  sub,
  valueTone = 'ink',
  spark,
  sparkTone = 'auto',
}: {
  icon: ReactNode;
  tint: TileTint;
  label: string;
  value: string;
  sub?: ReactNode;
  valueTone?: 'ink' | 'red' | 'green';
  spark?: number[];
  sparkTone?: 'auto' | 'up' | 'down' | 'brand';
}) {
  const valueColor = valueTone === 'red' ? 'text-risk-red' : valueTone === 'green' ? 'text-risk-green' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TINT_BG[tint]}`} aria-hidden="true">
          {icon}
        </span>
        {spark && spark.length >= 2 && <TrendSpark series={spark} tone={sparkTone} width={72} height={28} />}
      </div>
      <div className="mt-3 text-xs font-medium text-ink-soft">{label}</div>
      <div className={`nums mt-0.5 text-[1.7rem] font-semibold leading-tight tracking-tight ${valueColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
