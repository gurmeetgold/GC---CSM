import type { RiskLevel } from '../../domain';

/**
 * A small trend sparkline from a numeric series. Renders NOTHING when the series is
 * empty or has <2 points — cold-start / thin-data accounts show no sparkline rather
 * than a fabricated line (the honesty rule).
 */
export function TrendSpark({
  series,
  tone = 'auto',
  width = 84,
  height = 26,
  className = '',
}: {
  series: number[];
  tone?: 'auto' | 'up' | 'down' | 'brand';
  width?: number;
  height?: number;
  className?: string;
}) {
  const values = (series ?? []).filter((v) => Number.isFinite(v));
  if (values.length < 2) {
    return <span className={`text-xs text-ink-faint ${className}`} aria-hidden="true">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = values[values.length - 1]! >= values[0]!;
  const stroke =
    tone === 'brand' ? '#2563eb' : tone === 'up' ? '#1f9d55' : tone === 'down' ? '#d1344b' : up ? '#1f9d55' : '#d1344b';
  const areaId = `sk-${pts.length}-${Math.round(values[0]!)}-${Math.round(values[values.length - 1]!)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`1,${height - 1} ${pts.join(' ')} ${width - 1},${height - 1}`} fill={`url(#${areaId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A colored delta pill: ↑12% (green) / ↓18% (red), tone by good/bad direction. */
export function Delta({ value, goodWhenUp = true, suffix = '' }: { value: number; goodWhenUp?: boolean; suffix?: string }) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  const color = good ? 'text-risk-green' : 'text-risk-red';
  return (
    <span className={`nums inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

/** A 0–100 score ring (used on expansion / detail). Color by band. */
export function ScoreRing({ score, level }: { score: number; level?: RiskLevel }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = level === 'red' ? '#d1344b' : level === 'yellow' ? '#c77700' : level === 'green' ? '#1f9d55' : '#2563eb';
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5eaf1" strokeWidth="3.5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="nums absolute text-xs font-semibold text-ink">{Math.round(pct)}</span>
    </span>
  );
}
