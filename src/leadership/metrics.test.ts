import { describe, it, expect, beforeAll } from 'vitest';
import {
  retention, distribution, arrAtRisk, atRiskWithoutActivity, workloadByCsm,
  expansionPipeline, quarterlyRenewals, churnReasonsByCategory, retentionBySegment,
  leadershipSnapshot,
} from './metrics';
import { buildBook } from '../health/pipeline';
import { MockDataSource } from '../data/mock/MockDataSource';
import { MockSoftSignalExtractor } from '../answer/mock/MockSoftSignalExtractor';
import { REFERENCE_NOW } from '../data/mock/referenceTime';
import type { EvaluatedAccount } from '../answer';

const NOW = REFERENCE_NOW;

describe('leadership metrics (over the mock book)', () => {
  let book: EvaluatedAccount[];
  beforeAll(async () => {
    book = await buildBook(new MockDataSource(), { extractor: new MockSoftSignalExtractor() });
  });

  it('computes realistic NRR and GRR (GRR ≤ NRR, both in sane ranges)', () => {
    const r = retention(book);
    expect(r.nrrPct).toBeGreaterThan(100); // net expansion in the mock book
    expect(r.nrrPct).toBeLessThan(120);
    expect(r.grrPct).toBeGreaterThan(88);
    expect(r.grrPct).toBeLessThanOrEqual(100); // gross can't exceed 100
    expect(r.grrPct).toBeLessThanOrEqual(r.nrrPct);
  });

  it('distribution counts cover the whole book and dollars-at-risk match', () => {
    const d = distribution(book);
    expect(d.green.count + d.yellow.count + d.red.count).toBe(book.length);
    expect(d.red.arr).toBe(arrAtRisk(book));
  });

  it('surfaces at-risk accounts with no recent CSM activity (the hero tile)', () => {
    const rows = atRiskWithoutActivity(book, NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.riskLevel === 'red')).toBe(true);
    // bestforyou (champion 80d) is red and stale — must surface.
    expect(rows.some((r) => r.id === 'bestforyou')).toBe(true);
    // sorted by ARR desc
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.arr).toBeGreaterThanOrEqual(rows[i]!.arr);
  });

  it('balances the book by CSM (sorted by ARR, red load visible)', () => {
    const w = workloadByCsm(book);
    expect(w.length).toBeGreaterThan(1);
    for (let i = 1; i < w.length; i++) expect(w[i - 1]!.arr).toBeGreaterThanOrEqual(w[i]!.arr);
    expect(w.reduce((s, r) => s + r.accounts, 0)).toBe(book.length);
  });

  it('sizes the expansion pipeline from growth accounts', () => {
    const rows = expansionPipeline(book);
    const names = rows.map((r) => r.id);
    expect(names).toContain('adventureworks');
    expect(names).toContain('wingtip');
    expect(rows.every((r) => r.potentialArr > 0)).toBe(true);
  });

  it('groups renewals by quarter, red-and-expensive first, with reasons', () => {
    const groups = quarterlyRenewals(book, NOW);
    expect(groups.length).toBeGreaterThan(0);
    const withReds = groups.find((g) => g.redCount > 0);
    expect(withReds).toBeDefined();
    // the top renewal in a red-bearing quarter carries its "why"
    const top = withReds!.renewals[0]!;
    if (top.riskLevel === 'red') expect(top.reasons.length).toBeGreaterThan(0);
    // rollup adds up
    expect(withReds!.renewingArr).toBe(withReds!.renewals.reduce((s, r) => s + r.arr, 0));
  });

  it('infers churn reasons from fired signals, sorted by ARR', () => {
    const reasons = churnReasonsByCategory(book);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.type === 'adoption_gap')).toBe(true);
    for (let i = 1; i < reasons.length; i++) expect(reasons[i - 1]!.arr).toBeGreaterThanOrEqual(reasons[i]!.arr);
  });

  it('breaks retention down by segment', () => {
    const seg = retentionBySegment(book);
    expect(seg.map((s) => s.segment).sort()).toEqual(['enterprise', 'mid_market', 'smb']);
  });

  it('assembles a full snapshot without throwing', () => {
    const snap = leadershipSnapshot(book, NOW);
    expect(snap.retention.nrrPct).toBeGreaterThan(0);
    expect(snap.quarterlyRenewals.length).toBeGreaterThan(0);
    expect(snap.healthByCsm.length).toBeGreaterThan(1);
  });
});
