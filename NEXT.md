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

## What remains to run the live path for real (deployment, not code)

1. **A thin backend host.** The live source and Claude client are server-side (they
   carry secrets). Today the SPA runs mock in-browser. To serve live data to the
   browser, stand up a small API (Express/Fastify/Next route) that:
   - calls `buildDataSource(cfg)` / `buildAnswerEngine(cfg)` from
     `src/server/factory.ts`,
   - exposes `GET /accounts` (evaluated book) and `POST /ask`,
   - and add a browser `HttpDataSource`/`HttpAnswerEngine` (implementing the existing
     interfaces) that calls those endpoints. The switch already governs both sides.
2. **Secrets provisioning.** Set the env vars in `DATA_HANDLING.md` (Merge, Gong,
   Anthropic, `TOKEN_ENCRYPTION_KEY`) in the deploy environment.
3. **Merge + Gong connection.** Run the Merge Link flow (`MergeLinkService`) to
   connect a real Salesforce + Gong and store the account tokens encrypted.
4. **A recorded-payload capture step (optional but recommended).** Snapshot real
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
