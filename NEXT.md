# Phase 2 — what the real unified-API integration touches (and what it doesn't)

The whole point of the Phase 1 seams is that Phase 2 is additive. This is the
checklist to confirm the seams held.

## What Phase 2 ADDS (new files, beside the existing ones)

### 1. `src/data/live/UnifiedApiDataSource.ts` — a new `DataSource`
Implements the exact same interface `MockDataSource` already implements:

```ts
class UnifiedApiDataSource implements DataSource {
  readonly name = 'unified-api';
  now(): Date { return new Date(); }          // real clock
  async listAccounts(): Promise<Account[]> { … }
  async getAccount(id: string): Promise<Account | null> { … }
}
```

Its entire job is **normalization**: call the unified Salesforce/Gong API and map
vendor records into the domain `Account`/`Contact`/`Interaction`/`UsageSnapshot`
shape. Everything vendor-specific (field names like `AccountId__c`, Gong call IDs,
auth, pagination, retries) is quarantined in this file and its helpers. Because it
emits the identical normalized shape, the engine, the UI, and every test work
against it unchanged.

Wire it in one place:
```ts
// src/data/index.ts — the ONLY edit to existing data code
case 'live':
  return new UnifiedApiDataSource(config);
```
Set `VITE_DATA_SOURCE=live` and the whole app runs on real data. The mock stays as
the credential-free demo path and the integration-test harness.

**Contract test to add:** run `UnifiedApiDataSource` against a recorded API fixture
and assert every returned object satisfies the `Account` shape — the same assertion
`mockAccounts.test.ts` already makes structurally. This is what stops the mock and
live sources from drifting apart.

### 2. `src/answer/ClaudeAnswerEngine.ts` — a new `AnswerEngine`
Implements `AnswerEngine.ask(question, context)`, calls the Claude API with the
evaluated book as context, and returns the same `AnswerResult` shape. Inject it in
place of `MockAnswerEngine` at the one composition point in `AskAnything`
(`engine` prop) — no UI change.

### 3. Soft signals (Claude reads transcripts)
`Interaction.summary` already carries call/email text. A new soft-signal pass can
enrich an account with Claude-derived signals. Cleanest fit: a post-evaluation
enrichment step that appends `Signal`s of a new `polarity`/type — the `Signal`
type and roll-up already accommodate additional entries.

### 4. Admin panel for thresholds
`resolveThresholds(override)` already exists. Phase 2 adds the UI + persistence
that produces the `ThresholdOverride` object per customer and passes it into
`evaluate()`. **No engine change** — the override path is already there and tested.

### 5. Persistence
Swap in-memory for Postgres by writing a store *behind the same `DataSource`
interface* (or a repository the live source uses). The domain model is already
serializable (ISO date strings, no class instances), so it maps to rows directly.

## What Phase 2 does NOT touch (proof the seams held)

- **`src/domain/**`** — the normalized model. Vendor fields never reach it.
- **`src/engine/**`** — the crown jewel. Signals, thresholds semantics, roll-up,
  and all engine tests are source-agnostic and stay byte-for-byte identical.
- **`src/app/**`** — the three screens. They consume `EvaluatedAccount[]` and the
  two interfaces; they already can't tell mock from live (verified by the seam
  grep in the README). The only conceivable change is net-new screens (e.g. the
  admin panel), never edits to the existing three.
- **The `DataSource` / `AnswerEngine` interfaces themselves** — Phase 2 implements
  them, it doesn't reshape them.

## The one-line litmus test
If adding real data forces an edit inside `engine/`, `domain/`, or the existing
screens, a seam leaked and we fix the seam — not the engine.
