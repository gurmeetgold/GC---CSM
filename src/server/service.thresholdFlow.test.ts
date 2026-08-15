import { describe, it, expect } from 'vitest';
import { BookService } from './service';
import { resolveServerConfig } from './config';
import { InMemoryThresholdStore } from '../admin/thresholdStore';

const ORG = 'org-1';

/**
 * Proves the Phase 7 threshold-config flow end-to-end WITHOUT touching engine code:
 * persist an admin override via `ThresholdStore`, and the next `BookService.getBook()`
 * evaluation reflects it — a case that doesn't fire at the shipped default fires once
 * the override tightens the threshold (and vice versa via reset).
 */
describe('threshold-config flow (admin override -> engine behavior, no engine changes)', () => {
  it('tightening adoptionGap.minActivePctOfSeats flips a previously-green account to firing adoption_gap', async () => {
    const thresholds = new InMemoryThresholdStore();
    const cfg = resolveServerConfig({ DATA_SOURCE: 'mock' });

    const before = new BookService(cfg, 0, Date.now, thresholds, ORG);
    const beforeBook = await before.getBook();
    const beforeSignals = new Map(
      beforeBook.accounts.map((e) => [e.account.id, e.evaluation.signals.some((s) => s.type === 'adoption_gap')]),
    );

    // Find a mock account that is NOT firing adoption_gap at the default 50% floor
    // but does have some active-user shortfall we can tighten past with a much
    // higher floor (near-100%) — this forces at least one account to flip.
    await thresholds.set(ORG, { adoptionGap: { minActivePctOfSeats: 99 } });

    const after = new BookService(cfg, 0, Date.now, thresholds, ORG);
    const afterBook = await after.getBook();

    let flipped = false;
    for (const e of afterBook.accounts) {
      const fired = e.evaluation.signals.some((s) => s.type === 'adoption_gap');
      const firedBefore = beforeSignals.get(e.account.id) ?? false;
      if (fired && !firedBefore) flipped = true;
    }
    expect(flipped, 'expected at least one account to newly fire adoption_gap after tightening the threshold').toBe(true);
  });

  it('resetting the override restores the shipped default behavior', async () => {
    const thresholds = new InMemoryThresholdStore();
    const cfg = resolveServerConfig({ DATA_SOURCE: 'mock' });

    const svc = new BookService(cfg, 0, Date.now, thresholds, ORG);
    const defaultBook = await svc.getBook();

    await thresholds.set(ORG, { adoptionGap: { minActivePctOfSeats: 99 } });
    const tightened = new BookService(cfg, 0, Date.now, thresholds, ORG);
    const tightenedBook = await tightened.getBook();
    expect(tightenedBook.accounts).not.toEqual(defaultBook.accounts);

    await thresholds.reset(ORG, 'adoptionGap');
    const restored = new BookService(cfg, 0, Date.now, thresholds, ORG);
    const restoredBook = await restored.getBook();

    const sig = (b: typeof defaultBook) =>
      b.accounts.map((e) => [e.account.id, e.evaluation.riskLevel, e.evaluation.signals.map((s) => s.type).sort()]);
    expect(sig(restoredBook)).toEqual(sig(defaultBook));
  });
});
