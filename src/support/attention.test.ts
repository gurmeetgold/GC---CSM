import { describe, it, expect, beforeAll } from 'vitest';
import { supportSummary, ticketsNeedingAttention, slaBreaches, accountsPulledByTickets } from './attention';
import { buildBook } from '../health/pipeline';
import { MockDataSource } from '../data/mock/MockDataSource';
import { MockSoftSignalExtractor } from '../answer/mock/MockSoftSignalExtractor';
import { REFERENCE_NOW } from '../data/mock/referenceTime';
import type { EvaluatedAccount } from '../answer';

describe('support attention (help-desk derivations)', () => {
  let book: EvaluatedAccount[];
  beforeAll(async () => {
    book = await buildBook(new MockDataSource(), { extractor: new MockSoftSignalExtractor() });
  });

  it('summarizes open tickets, P1s and SLA breaches', () => {
    const s = supportSummary(book, REFERENCE_NOW);
    expect(s.openTotal).toBeGreaterThan(0);
    expect(s.p1Total).toBeGreaterThan(0); // alpineski has 2 P1s
    expect(s.breachedTotal).toBeGreaterThan(0); // alpineski has breached tickets
  });

  it('ranks the most urgent tickets first (P1 + breached float up)', () => {
    const rows = ticketsNeedingAttention(book, REFERENCE_NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.severity === 'p1' || rows[0]!.slaStatus === 'breached').toBe(true);
  });

  it('lists SLA breaches/at-risk only', () => {
    const rows = slaBreaches(book, REFERENCE_NOW);
    expect(rows.every((r) => r.slaStatus !== 'ok')).toBe(true);
  });

  it('links ticket strain to account risk (alpineski pulled toward red)', () => {
    const pulled = accountsPulledByTickets(book);
    const alpine = pulled.find((p) => p.accountId === 'alpineski');
    expect(alpine).toBeDefined();
    expect(alpine!.supportSignalFired).toBe(true);
    expect(alpine!.p1Tickets).toBeGreaterThan(0);
  });
});
