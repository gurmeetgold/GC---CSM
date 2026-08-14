# NEXT — where things stand and what's left

## Phase 2 status: live path built, behind the switches

The seams from Phase 1 held. Phase 2 added the live implementations **beside** the
mock, without touching the signal engine or breaking the mock path.

### Shipped this phase
- `UnifiedApiDataSource` (Salesforce via Merge + Gong) implementing the same
  `DataSource` interface, with a full vendor→domain adapter, per-source graceful
  degradation, and pagination/rate-limit handling.
- `ClaudeAnswerEngine` for ask-anything, plus a soft-signal extractor and a
  reasoning writer — all behind injected `ClaudeClient`.
- Soft signals fold into risk through the engine's own frozen `rollUp`
  (`src/health/combine.ts`); the end-to-end pipeline lives in `src/health/pipeline.ts`.
- OAuth connect flow (Merge Link), encrypted token store (AES-256-GCM), independent
  `DATA_SOURCE` / `ANSWER_ENGINE` switches, server-side config + factory.
- Docs: `DATA_HANDLING.md`, `PHASE2_SIGNAL_PROPOSALS.md`; `DECISIONS.md` updated.

### Proven without live credentials
Everything is covered by fixture/stub tests (177 total, all green): the anti-drift
contract test, adapter tests over messy vendor payloads, graceful-degradation tests,
HTTP resilience (429/401/5xx/pagination), soft-signal validation + clamping,
reasoning faithfulness, and the encrypted token store. The Phase 1 signal-engine
tests pass unchanged.

## The backend host is now built ✅

The thin backend that serves live data to the browser is implemented and tested:

- `src/server/http.ts` — Express app: `GET /api/health`, `GET /api/accounts`
  (evaluated book + red-account reasoning), `POST /api/ask`. Runs
  `buildDataSource`/`buildAnswerEngine`/`buildSoftSignalEnrichment` from the factory.
- `src/server/service.ts` — `BookService`: assembles the implementations from config,
  caches the evaluated book (60s TTL), answers questions.
- `src/server/main.ts` — entry point (`npm run server` / `npm start`).
- Browser side: `HttpBookProvider` + `HttpAnswerEngine` implement the existing seams;
  `resolveBookProvider()` picks HTTP vs in-browser-mock by `VITE_BACKEND_URL`. The UI
  is unchanged and can't tell which is behind it.
- Verified end-to-end in mock mode (server integration test + a live browser fetch);
  the live pipeline itself is proven against fixtures in `src/health/pipeline.test.ts`.

### What remains to point it at real accounts (deployment, not code)

1. **Secrets provisioning.** Set the env vars in `.env.example` / `DATA_HANDLING.md`
   (Merge, Gong, Anthropic, `TOKEN_ENCRYPTION_KEY`) in the deploy environment, then
   `DATA_SOURCE=live ANSWER_ENGINE=claude npm run server`.
2. **Merge + Gong connection.** Run the Merge Link flow (`MergeLinkService`) to connect
   a real Salesforce + Gong and store the account tokens encrypted. (A tiny
   `/api/connect` route to drive this from the UI is the only remaining server surface.)
3. **A recorded-payload capture step (optional but recommended).** Snapshot real
   (anonymized) Merge/Gong responses into fixtures to widen the adapter tests against
   the specific customer's Salesforce config.

## What is still explicitly out (future phases)
- Persistence of computed signals (a cache) — still in-memory; a Postgres `TokenStore`
  and signal cache drop in behind existing interfaces.
- The admin panel for per-customer / per-segment thresholds (`resolveThresholds`
  already supports overrides; see PHASE2_SIGNAL_PROPOSALS.md #3/#4).
- Any signal-logic changes real data suggests — collected in
  `PHASE2_SIGNAL_PROPOSALS.md`, proposed not applied.

## The litmus test still holds
Nothing in `engine/` or `domain/` (beyond additive soft-signal types) changed, and
the mock path runs exactly as in Phase 1. If a future phase forces an engine edit to
onboard data, that's a seam leak to fix in the adapter — not the engine.

---

# Phase 3 — live-adapter follow-ups (mock renders everything today)

Everything Phase 3 added renders from mock now. The live adapter emits the same new
fields so the **contract test still proves mock and live are shape-identical** — but
a few fields are currently empty-safe placeholders on the live side and need a real
data source wired before the live path shows them with real values:

| Field | Live source today | Phase-4 work |
|---|---|---|
| `responsiveness` | `[]` (placeholder) | compute median reply time + reply rate from email thread metadata (Gong/email API) |
| `featureUsage` | `[]` (placeholder) | pull per-feature usage from a product-analytics source (Amplitude/Snowflake) |
| `UsageSnapshot.logins` | absent | same product-analytics source (for stickiness) |
| `activatedAt` | custom field or null | map the activation-milestone field, or derive from first-value event |
| `billingFlags` | custom fields | map from the billing system (Stripe/NetSuite) or SFDC flags |
| `ownerCsm` | custom field / account owner | map Salesforce Account Owner |
| `priorArr` | custom field or `arr` | compute from the prior renewal's ARR (opportunity history) |
| `lifecycleState` | custom field or `active` | map the customer-stage field |

The hard signals that depend on the first three (`email_responsiveness`,
`feature_depth`, `stickiness_decline`) will simply **abstain** on the live path until
those sources are connected — never a false red — exactly as they abstain on a mock
account that lacks the data. So the live path degrades gracefully the day it's turned
on, and each source lights up its signal as it's connected.

**Parity confirmed:** `src/data/contract.test.ts` asserts both `MockDataSource` and
`UnifiedApiDataSource` emit the identical top-level key set and per-field types,
including all eight Phase 3 fields. If a future change drifts one side, it fails.

Leadership needs no new data source — every metric is derived from the normalized
model + fired signals. `ownerCsm`/`priorArr`/`lifecycleState` are the only new inputs
it relies on, all listed above.

---

# Phase 4 — where the premium tier and deep-usage integrations plug in

Everything Phase 4 ships renders from mock and is honestly sourceable from the MVP
integrations (CRM, Gong, email/calendar, help desk, Slack). Two clean extension
points are left for later, with nothing faked now:

## Premium **technical tier** (engineering / incident data)
The CUT TAM engineering dashboard becomes a paid add-on when we connect PagerDuty,
observability, and engineering Jira. It would light up: real eng P1/P2 incidents, an
integration-health score, eng escalations, TAM capacity planning, and a technical-risk
model. Plug-in point: a new `TechnicalDataSource` beside the existing sources feeding
a new `technical/` module and a `Technical Health` screen upgrade — the nav item and
architectural slot already exist (currently the LIGHT help-desk view).

## Deep **product-usage** integrations (Segment / Amplitude / Snowflake)
When a product-analytics/warehouse source connects, three things upgrade automatically:
- `email_responsiveness`, `feature_depth`, and `stickiness_decline` signals stop
  abstaining and start firing on real data (they already exist and are tested).
- The account-detail metric tiles can move from qualitative (High/Medium/Low) to real
  scored values; the Expansion screen can add usage-based readiness.
- `trendSeries` is replaced by a genuine accrued time-series (the modeled demo series
  retires).

Plug-in point: fill the `responsiveness` / `featureUsage` / `UsageSnapshot.logins`
fields in the live adapter (they are already in the normalized shape and empty-safe
today), and relax the "qualitative only" rule on the detail tiles.

**Parity still holds:** the contract test asserts mock and live emit identical shapes
including all Phase 4 fields (`tickets`, `opportunities`, `trendSeries`).
