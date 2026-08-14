# Phase 2 Signal Proposals

Changes to the signal engine that real (unified-API) data suggests. **These are
proposed, NOT applied.** The engine's thresholds and logic are unchanged this phase;
nothing here ships without your explicit approval.

Status legend: 🔵 proposed · ⚪ needs data to decide

---

## 1. 🔵 Usage history is often absent from CRM — consider a product-usage source

**Observation.** `usage_decline` and the cold-start guard depend on a usage
time-series. Salesforce/Merge rarely carries one; in the adapter it comes from a
custom field (`Usage_History__c`) that most orgs won't populate. In practice many
live accounts will have empty `usageHistory`, so `usage_decline` abstains and those
accounts look artificially calm on that dimension.

**Proposal (not applied).** Either (a) add a dedicated product-usage `DataSource`
input feeding `usageHistory`, or (b) introduce a separate "no usage telemetry"
account state so the UI can distinguish "usage is fine" from "we have no usage
data." No threshold change — this is about data availability, not the rule.

**Why wait for you.** It changes what feeds the engine and possibly adds a UI state.

---

## 2. 🔵 Soft-signal severity is clamped to `warning` — confirm the ceiling

**Observation.** To ensure an LLM can never single-handedly turn an account red, the
soft-signal extractor clamps risk-polarity soft signals to `warning` severity
(`src/answer/claude/softSignals.ts`). So two soft signals (or one soft + one hard)
are needed for red; a lone soft signal caps at yellow.

**Proposal (not applied).** Keep the clamp (recommended for trust), OR allow a
specific high-confidence soft type (e.g. explicit competitor displacement) to reach
`critical` behind a confidence threshold. This is a policy call about how much the
model is allowed to move risk.

**Why wait for you.** It directly affects how LLM output influences `RiskLevel`.

---

## 3. ⚪ Adoption-gap floor may be too blunt across segments

**Observation.** Real books span SMB and enterprise. A flat 50% adoption floor may
over-flag enterprise land-and-expand accounts (large seat counts, gradual rollout)
and under-flag SMB. The threshold config already supports per-customer overrides,
but not per-segment.

**Proposal (not applied).** Consider per-segment adoption floors (e.g. enterprise
40%, SMB 60%). Purely a `ThresholdConfig` shape extension — still data, not logic —
but it changes the config surface the admin panel exposes.

**Why wait for you.** Needs real distribution data to pick numbers, and it widens
the threshold schema.

---

## 4. ⚪ Renewal window vs. sales-cycle length

**Observation.** The 60-day renewal-risk window is a reasonable default, but
enterprise renewals often need 90–120 days of runway. Live renewal-date data will
tell us the right window per segment.

**Proposal (not applied).** Revisit `renewalRisk.withinDays` (globally or per
segment) once we can measure typical time-to-close against renewal dates.

---

## Guardrail reminder

The Phase 1 signal set's own tests still pass unchanged. The Phase 3 changes below
were explicitly APPROVED before implementation.

---

# Phase 3 — approved and implemented

These were proposed and **approved by the product owner** before wiring:

### ✅ Two new soft-signal types (APPROVED)
- **`sponsor_disengagement`** — the senior economic buyer has stopped attending /
  gone quiet (attendance + language). Distinct from `champion_disengaging`.
- **`support_sentiment`** — frustration in the *wording* of support tickets.
  Distinct from the hard `support_strain` (which is volume/severity only).

Both carry the Phase 2 guardrails: emitted only with specific evidence (a call /
email / ticket, carried as the "why"), severity-clamped to `warning` (an LLM/soft
signal can never solo-red an account), and absent when the source is unavailable.

### ✅ `renewal_risk` v2 — jeopardy-tiered severity (APPROVED)
Severity is now tiered instead of always-critical: **critical** when the renewal is
imminent (≤30d), high-ARR (≥$250k), or ≥2 other risks stack; otherwise **warning**.
`rollUp` treats renewal as an amplifier (not a stacking driver). Effect: far-off,
low-ARR, single-risk renewals now read **yellow** instead of red (mock accounts
`relecloud` and `margiestravel` flipped red→yellow). This is the one approved change
to the frozen engine; it is covered by new tiered tests.

### Still open for your call (unchanged from above)
Item **#2** (whether a high-confidence competitor/displacement soft signal should
ever be allowed to reach `critical` rather than the current `warning` clamp) remains
a **proposal** — the clamp is in force until you decide.

### New hard signals (in spec, not "proposals")
The six new hard signals (engagement cadence, email responsiveness, feature depth,
stickiness, onboarding stalled, billing friction) were part of the Phase 3 scope and
are implemented with default thresholds (all overridable via `ThresholdConfig`).
