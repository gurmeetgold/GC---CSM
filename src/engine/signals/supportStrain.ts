import type { Signal } from '../../domain';
import { type SignalFn } from './types';

/**
 * Support strain: an open-ticket backlog or any critical-severity tickets beyond
 * the tolerated cap. Escalates to `critical` severity when the critical-ticket
 * cap is breached (a sev-1 in flight is an account-level emergency), otherwise
 * `warning` for sheer volume.
 */
export const supportStrain: SignalFn = (account, t) => {
  const open = account.openTickets ?? 0;
  const critical = account.criticalTickets ?? 0;

  const criticalBreach = critical > t.supportStrain.maxCriticalTickets;
  const volumeBreach = open > t.supportStrain.maxOpenTickets;
  if (!criticalBreach && !volumeBreach) return null;

  const parts: string[] = [];
  if (volumeBreach) parts.push(`${open} open tickets (cap ${t.supportStrain.maxOpenTickets})`);
  if (criticalBreach) parts.push(`${critical} critical tickets (cap ${t.supportStrain.maxCriticalTickets})`);

  const signal: Signal = {
    type: 'support_strain',
    polarity: 'risk',
    severity: criticalBreach ? 'critical' : 'warning',
    headline: criticalBreach
      ? `${critical} critical support tickets open`
      : `${open} open support tickets`,
    detail: `Support load is elevated: ${parts.join('; ')}.`,
    evidence: {
      openTickets: open,
      criticalTickets: critical,
      openCap: t.supportStrain.maxOpenTickets,
      criticalCap: t.supportStrain.maxCriticalTickets,
    },
  };
  return signal;
};
