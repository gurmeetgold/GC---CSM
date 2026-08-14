import type { EvaluatedAccount } from '../answer';
import type { Segment } from '../domain';

/**
 * Expansion — SIGNALS only, no modeled valuation. We deliberately do NOT compute a
 * 0–100 expansion score, a weighted pipeline, or multi-product fit (those need the
 * product-usage warehouse we don't have). We surface the honest expansion signals we
 * CAN see and, where a real CRM opportunity exists, its dollar amount.
 */

export interface ExpansionSignalRow {
  accountId: string;
  accountName: string;
  segment: Segment;
  arr: number;
  /** The honest signals suggesting expansion readiness (from Gong/CRM/email). */
  signals: string[];
  /** Champion relationship strength from conversation intelligence. */
  championStrength: 'strong' | 'medium' | 'weak' | 'none';
  /** Real CRM open-expansion opportunity amount, if one exists (else null — never modeled). */
  crmOpportunityArr: number | null;
}

function championStrength(e: EvaluatedAccount): ExpansionSignalRow['championStrength'] {
  const champs = (e.account.contacts ?? []).filter((c) => c.isChampion);
  if (champs.length === 0) return 'none';
  const best = champs.some((c) => c.engagement === 'high')
    ? 'strong'
    : champs.some((c) => c.engagement === 'medium')
      ? 'medium'
      : 'weak';
  return best;
}

/** Accounts flashing honest expansion signals, sized only by real CRM opportunity $. */
export function expansionSignalRows(book: EvaluatedAccount[]): ExpansionSignalRow[] {
  const rows: ExpansionSignalRow[] = [];
  for (const e of book) {
    const signals: string[] = [];

    if (e.evaluation.signals.some((s) => s.type === 'growth_opportunity')) {
      signals.push('Near seat capacity');
    }
    if (e.evaluation.signals.some((s) => s.type === 'buying_signal')) {
      signals.push('Buying language on a call');
    }
    const strength = championStrength(e);
    if (strength === 'strong') signals.push('Strong champion engagement');

    const expansionOpps = (e.account.opportunities ?? []).filter(
      (o) => o.isExpansion && o.stage !== 'closed_lost' && o.stage !== 'closed_won',
    );
    const crmArr = expansionOpps.reduce((s, o) => s + o.amount, 0);
    if (crmArr > 0) signals.push('Open CRM expansion opportunity');

    // Only surface accounts that are healthy-ish AND show at least one signal.
    if (signals.length === 0 || e.evaluation.riskLevel === 'red') continue;

    rows.push({
      accountId: e.account.id,
      accountName: e.account.name,
      segment: e.account.segment,
      arr: e.account.arr,
      signals,
      championStrength: strength,
      crmOpportunityArr: crmArr > 0 ? crmArr : null,
    });
  }
  // Sort: real CRM $ first (desc), then by ARR.
  return rows.sort((a, b) => (b.crmOpportunityArr ?? 0) - (a.crmOpportunityArr ?? 0) || b.arr - a.arr);
}

export interface ExpansionSummary {
  accountsWithSignals: number;
  crmPipelineArr: number; // sum of REAL open CRM expansion opps only
  strongChampions: number;
}

export function expansionSummary(book: EvaluatedAccount[]): ExpansionSummary {
  const rows = expansionSignalRows(book);
  return {
    accountsWithSignals: rows.length,
    crmPipelineArr: rows.reduce((s, r) => s + (r.crmOpportunityArr ?? 0), 0),
    strongChampions: rows.filter((r) => r.championStrength === 'strong').length,
  };
}
