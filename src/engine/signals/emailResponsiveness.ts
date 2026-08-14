import type { ResponsivenessSnapshot } from '../../domain';
import { type SignalFn } from './types';

/**
 * Email responsiveness falling: the customer is taking longer to reply (or has
 * stopped replying) to our outreach. Reads the latest responsiveness snapshot
 * inside the window and fires when reply latency exceeds the cap OR the reply rate
 * drops below the floor.
 *
 * Abstains when there is no responsiveness data (graceful — never a false red for a
 * source we simply don't have).
 */
export const emailResponsiveness: SignalFn = (account, t, now) => {
  const cfg = t.emailResponsiveness;
  const windowStart = now.getTime() - cfg.windowDays * 86_400_000;

  const inWindow = (account.responsiveness ?? [])
    .filter((s) => {
      const ms = Date.parse(s.asOf);
      return !Number.isNaN(ms) && ms >= windowStart && ms <= now.getTime();
    })
    .sort((a, b) => Date.parse(a.asOf) - Date.parse(b.asOf));

  const latest: ResponsivenessSnapshot | undefined = inWindow[inWindow.length - 1];
  if (!latest) return null;

  const slow = latest.medianReplyHours > cfg.maxMedianReplyHours;
  const quiet = latest.replyRatePct < cfg.minReplyRatePct;
  if (!slow && !quiet) return null;

  const reasons: string[] = [];
  if (slow) reasons.push(`median reply time ${Math.round(latest.medianReplyHours)}h (cap ${cfg.maxMedianReplyHours}h)`);
  if (quiet) reasons.push(`only ${Math.round(latest.replyRatePct)}% of emails answered (floor ${cfg.minReplyRatePct}%)`);

  return {
    type: 'email_responsiveness',
    polarity: 'risk',
    severity: 'warning',
    headline: quiet ? `Email replies drying up` : `Slower email replies (${Math.round(latest.medianReplyHours)}h)`,
    detail: `Email responsiveness is slipping: ${reasons.join('; ')}.`,
    evidence: {
      medianReplyHours: Math.round(latest.medianReplyHours),
      replyRatePct: Math.round(latest.replyRatePct),
      maxMedianReplyHours: cfg.maxMedianReplyHours,
      minReplyRatePct: cfg.minReplyRatePct,
    },
  };
};
