import type { RiskLevel } from '../../domain';
import { RISK_STYLES } from '../format';

/**
 * The single most important visual signal in the app. Health state is encoded
 * THREE ways at once — color, a text label, and a distinct shape/glyph — so it
 * survives colorblindness and a fast scan, and never relies on color alone.
 *
 *   red    ▲  (alert triangle — the loudest shape)
 *   yellow ●  (filled dot — watch)
 *   green  ✓  (check — healthy)
 */
const GLYPH: Record<RiskLevel, string> = { red: '▲', yellow: '●', green: '✓' };

export function RiskBadge({ level, size = 'md' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const s = RISK_STYLES[level];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ${s.bg} ${s.text} ${s.ring} ${pad}`}
    >
      <span className={`text-[0.7em] leading-none ${level === 'yellow' ? '' : 'translate-y-[0.5px]'}`} aria-hidden="true">
        {GLYPH[level]}
      </span>
      {s.label}
    </span>
  );
}
