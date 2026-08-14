import { describe, it, expect, beforeAll } from 'vitest';
import { expansionSignalRows, expansionSummary } from './signals';
import { buildBook } from '../health/pipeline';
import { MockDataSource } from '../data/mock/MockDataSource';
import { MockSoftSignalExtractor } from '../answer/mock/MockSoftSignalExtractor';
import type { EvaluatedAccount } from '../answer';

describe('expansion signals (honest, no modeled valuation)', () => {
  let book: EvaluatedAccount[];
  beforeAll(async () => {
    book = await buildBook(new MockDataSource(), { extractor: new MockSoftSignalExtractor() });
  });

  it('surfaces growth-signal accounts with their honest signals', () => {
    const rows = expansionSignalRows(book);
    const ids = rows.map((r) => r.accountId);
    expect(ids).toContain('adventureworks');
    expect(rows.every((r) => r.signals.length > 0)).toBe(true);
  });

  it('never surfaces a red account as an expansion opportunity', () => {
    const rows = expansionSignalRows(book);
    const reds = new Set(book.filter((e) => e.evaluation.riskLevel === 'red').map((e) => e.account.id));
    expect(rows.every((r) => !reds.has(r.accountId))).toBe(true);
  });

  it('only reports dollar amounts from real CRM opportunities (never modeled)', () => {
    const rows = expansionSignalRows(book);
    for (const r of rows) {
      if (r.crmOpportunityArr !== null) {
        const acct = book.find((e) => e.account.id === r.accountId)!;
        const realArr = acct.account.opportunities.filter((o) => o.isExpansion).reduce((s, o) => s + o.amount, 0);
        expect(r.crmOpportunityArr).toBe(realArr);
      }
    }
  });

  it('summary counts signals and sums only real CRM pipeline', () => {
    const s = expansionSummary(book);
    expect(s.accountsWithSignals).toBeGreaterThan(0);
    expect(s.crmPipelineArr).toBeGreaterThan(0); // growth accounts carry real CRM opps
  });
});
