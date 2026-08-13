# Architecture Decisions — Phase 1

This records the consequential choices made building the CS Copilot skeleton, and
why. It is meant to be read alongside the code, not instead of it.

## 1. Layering and the dependency rule

```
ui/app  →  { engine, data-interface, answer-interface }  →  domain
```

- **`domain/`** holds pure types (`Account`, `Signal`, `RiskLevel`, `Contact`,
  `Interaction`, `ThresholdConfig`). Zero logic, zero imports. Everything speaks
  in these terms.
- **`engine/`** (the crown jewel) imports only `domain/`. No UI, no data-source,
  no vendor code.
- **`data/`** and **`answer/`** define interfaces and their implementations. These
  are the *only* modules allowed to name a vendor or the word "mock".
- **`app/`** (React) imports `engine/`, the two interfaces, and `domain/`. It never
  imports a concrete `MockDataSource`/vendor module directly except at the single
  composition point (`data/index.ts`'s `createDataSource`).

**Why:** the seams the brief cares about are enforced by structure, so they can't
rot silently. The seam pass (below) is a grep that proves it.

## 2. The signal engine is a registry of pure functions

Every independent signal has the identical signature
`(account, thresholds, now) => Signal | null`. They live one-per-file under
`engine/signals/` and are collected in `SIGNAL_REGISTRY`. `evaluate()` runs the
registry and rolls the results up.

**Why:** adding a signal is appending one pure function to the registry — the
evaluator and roll-up never change. Each signal is independently unit-testable
with no mocking. This is the IP; it stays trivially inspectable.

**Consequence — `now` is injected, never read from the clock.** No signal calls
`Date.now()`. The reference time is passed in, so every evaluation is
deterministic and every test pins the clock. Production callers get `now` from the
`DataSource` (see #5).

## 3. `renewal_risk` is an amplifier, computed after the independent signals

Renewal proximity alone is *not* a risk — a healthy account that renews next month
is fine. `renewal_risk` fires only when renewal is within the window **and** at
least one other risk signal already fired. It therefore can't be a plain registry
entry (those only see the account); it takes the already-fired risk signals as
input and is layered in by `evaluate()` after the registry runs.

**Why:** it models the real CSM intuition ("a renewal cliff *with problems*") and
avoids double-counting. The mock account `humongous` (renews in 50 days, nothing
else wrong → stays green) is the regression guard for this.

## 4. Roll-up rule

- **red** = any `critical` risk signal, OR ≥2 stacked `warning` risk signals.
- **yellow** = exactly one `warning` risk signal.
- **green** = no risk signals.
- Opportunity signals (`growth_opportunity`) never affect risk level.

Severity assignments: `usage_decline`, `renewal_risk`, and critical-ticket
`support_strain` are `critical`; `adoption_gap`, `champion_silence`, and
volume-only `support_strain` are `warning`; `growth_opportunity` is `info`.

**Why:** matches the brief's "one weak signal = yellow, stacked = red" while
letting a single genuinely severe signal (a 40% usage cliff) stand on its own.

## 5. Data source owns its "as-of" clock

`DataSource` exposes `now(): Date`. `MockDataSource` returns a fixed
`REFERENCE_NOW` (2026-08-13); the future live source returns the real clock.

**Why:** the mock's dates are relative and must trip the intended signals
deterministically. The alternative — the UI importing `REFERENCE_NOW` and branching
on source type — would violate the no-branching rule. Letting the source declare
its own temporal frame keeps the UI totally source-agnostic. This is the one place
the "mock and live emit identical shapes" contract needed a deliberate design move.

## 6. Thresholds are data, deep-merged

All tunable numbers live in `DEFAULT_THRESHOLDS`. `resolveThresholds(override)`
deep-merges a partial override over the defaults. Logic never hardcodes a number;
signals receive the resolved config.

**Why:** the later admin panel supplies per-customer overrides as a partial object
with no code change. Tests exercise this by passing custom threshold objects.

## 7. Cold-start signals abstain rather than guess

An account is "cold-start" when it has fewer than `minUsageSnapshots` snapshots OR
is younger than `minAgeDays`. On cold-start, the data-dependent signals
(`usage_decline`, `adoption_gap`, `champion_silence`, `growth`) return `null`.
`support_strain` is deliberately **not** gated — 10 open tickets during onboarding
is a real emergency, not noise.

**Why:** thin data must never produce a false-confident red. A two-week-old account
with 15% seat utilization is expected ramp, not an adoption gap. This is asserted
directly (`treyresearch`, `lucerne`, and an explicit cold-start test).

## 8. The engine never throws

`evaluate()` wraps each signal in try/catch; a misbehaving signal simply doesn't
fire. Signals themselves tolerate nulls, missing fields, unparseable dates, and
absurd values (see the adversarial test).

**Why:** real data-source drift *will* produce malformed records. A single bad
field on one account must not blank the whole dashboard.

## 9. Answer engine returns structured results, not strings

`AnswerEngine.ask()` returns an `AnswerResult` (`text` + `kind` + referenced
`accounts` + `interpretedAs`), not a bare string. `MockAnswerEngine` does
deterministic keyword intent-matching over the evaluated book.

**Why:** the UI renders answers richly (clickable account rows, risk badges) and
the shape won't change when `ClaudeAnswerEngine` replaces the mock. `interpretedAs`
also gives us a cheap debugging window into intent routing.

## 10. Stack: Vite + React + TS + Vitest + Tailwind

Vite/Vitest share one TS-native toolchain (fast engine tests, same transforms as
the app). No database — `MockDataSource` is in-memory behind the async `DataSource`
interface, so a Postgres-backed store drops in as another implementation.

## Notable bugs caught by the tests during the build (kept honest)

- **Champion silence used the *longest* silence across champions** instead of the
  freshest contact — a still-warm champion should protect the account. Fixed to use
  the minimum silence; the multi-champion test is the guard.
- **`'count'` is a substring of `'accounts'`**, so the answer engine mis-routed
  "which accounts are at risk?" to the counting intent. Fixed with word-boundary
  matching.
