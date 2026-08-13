import type { RiskLevel } from '../../domain';
import { RISK_STYLES } from '../format';

/**
 * The single most important visual signal in the app. Health state is encoded
 * redundantly — color AND a text label AND a filled dot — so it never relies on
 * color alone (colorblind-safe) and reads instantly at a glance.
 */
export function RiskBadge({ level, size = 'md' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const s = RISK_STYLES[level];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ${s.bg} ${s.text} ${s.ring} ${pad}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
