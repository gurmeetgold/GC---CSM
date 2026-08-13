import type { UsageSnapshot } from '../../domain';

/**
 * A minimal usage-trend sparkline. Purely decorative context for the numbers, so
 * it is aria-hidden; the real signal lives in the risk badge and reasons.
 */
export function Sparkline({
  history,
  current,
  className = '',
}: {
  history: UsageSnapshot[];
  current: number;
  className?: string;
}) {
  const values = [...history.map((h) => h.activeUsers), current].filter((v) => Number.isFinite(v));
  if (values.length < 2) {
    return <div className={`text-xs text-ink-faint ${className}`} aria-hidden="true">—</div>;
  }

  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / span) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trendingDown = values[values.length - 1]! < values[0]!;
  const stroke = trendingDown ? '#d1344b' : '#1f9d55';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" role="presentation">
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
