import type { RiskLevel } from '../domain';

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysBetween(iso: string, now: Date): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - now.getTime()) / 86_400_000);
}

/** Tailwind utility bundles per risk level — the single source of health-color truth in the UI. */
export const RISK_STYLES: Record<RiskLevel, { dot: string; text: string; bg: string; ring: string; label: string }> = {
  green: { dot: 'bg-risk-green', text: 'text-risk-green', bg: 'bg-risk-greenBg', ring: 'ring-risk-green/30', label: 'Healthy' },
  yellow: { dot: 'bg-risk-yellow', text: 'text-risk-yellow', bg: 'bg-risk-yellowBg', ring: 'ring-risk-yellow/30', label: 'Watch' },
  red: { dot: 'bg-risk-red', text: 'text-risk-red', bg: 'bg-risk-redBg', ring: 'ring-risk-red/30', label: 'At risk' },
};

export const RISK_ORDER: Record<RiskLevel, number> = { red: 0, yellow: 1, green: 2 };
