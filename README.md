# Customer Success Copilot — Phase 1

A single view of a CSM's book of business: which accounts are at risk, why, and
what changed. This phase ships the app skeleton, a realistic mock-data layer, the
pure risk-signal engine, and three screens. No external network calls.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (runs on the mock data source)
npm test           # 106 tests — engine covered exhaustively
npm run build      # typecheck + production build
```

The app runs on the **mock data source** by default (no credentials needed). The
data source is selected by a single env flag:

```bash
VITE_DATA_SOURCE=mock   # default — the permanent demo + test path
VITE_DATA_SOURCE=live   # Phase 2 — UnifiedApiDataSource (not implemented yet)
```

## The three screens

1. **Health overview** — every account as green / yellow / red, sortable by health,
   ARR, adoption, renewal, or name.
2. **At-risk accounts** (the hero) — each red account with the specific signals that
   fired, in plain language, ranked by ARR at risk.
3. **Ask anything** — a natural-language box over the evaluated book, backed by a
   pluggable `AnswerEngine` (deterministic mock now, Claude later).

## Architecture

```
src/
  domain/    pure types — Account, Signal, RiskLevel, Contact, Interaction, thresholds
  engine/    the crown jewel — pure signal functions + roll-up. Imports only domain/
    signals/   one pure (account, thresholds, now) => Signal|null per file
  data/      DataSource interface + MockDataSource (UnifiedApiDataSource in Phase 2)
  answer/    AnswerEngine interface + MockAnswerEngine (ClaudeAnswerEngine in Phase 2)
  app/       React screens — depend on engine/ + interfaces, never on a concrete source
```

See **`DECISIONS.md`** for why, and **`NEXT.md`** for exactly what Phase 2 touches.

## The seams (why later phases won't need a rewrite)

- **Signal engine is pure and isolated.** `engine/` imports only `domain/`.
- **Data source behind an interface.** The app picks `mock|live` via one flag and
  cannot tell which implementation is behind `DataSource`. Both emit the identical
  normalized `Account` shape, so the mock can't drift from real data.
- **Answer engine behind an interface.** Same story for `AnswerEngine`.
- **Thresholds are data.** `resolveThresholds(override)` deep-merges per-customer
  overrides — the admin panel needs no engine change.

### Verifying the seams yourself

```bash
# Nothing outside data/ and answer/ may import a concrete source or the word "mock":
grep -rn "MockDataSource\|MockAnswerEngine\|referenceTime\|/mock/" src \
  | grep -v "src/data/" | grep -v "src/answer/"
# → only src/data/index.ts (the single composition point) should appear.
```

## Testing

The engine is tested exhaustively — every signal fires when it should, stays silent
when it shouldn't, and is checked just above / just below / exactly at each
threshold. A table-driven test asserts the expected risk level (and key signals) for
all 25 mock accounts. An adversarial suite proves the engine never throws on empty,
null, malformed, or absurd input, and a cold-start test proves thin data never reads
red. React/mock glue gets a light smoke pass only.
