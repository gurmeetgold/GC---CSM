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

---

# Phase 2 Decisions — live integration (Salesforce + Gong + Claude)

Prime directive this phase: **the mock never breaks and the two paths never
diverge.** Everything below ships behind the existing `DATA_SOURCE` and
`ANSWER_ENGINE` switches, and the frozen signal engine is untouched.

## 11. Unified API: Merge.dev

Salesforce comes through Merge's unified CRM (accounts, contacts, opportunities) and
Ticketing categories; Gong through a conversation client. Merge's Link flow also
owns the raw OAuth to Salesforce/Gong, so we never hold vendor client secrets or run
refresh loops. Vendor field names are quarantined to `src/data/live/` (isolation
grep proves it).

## 12. Every external dependency is an injected interface

`MergeClient`, `GongClient`, and `ClaudeClient` are interfaces. The data source and
answer engine depend only on them, so **CI runs entirely on fixtures with zero
credentials** — no test hits a live API. The real HTTP implementations
(`httpClients.ts`, `claudeClient.ts`) carry secrets and are server-side only; the
browser build excludes them (verified by the bundle).

## 13. The clock/`now` seam extended to the live source

`UnifiedApiDataSource.now()` returns the real clock; the mock returns its fixed
reference date. The UI still can't tell them apart — same seam as Phase 1.

## 14. Soft signals reach risk ONLY through the engine's own roll-up

Claude soft signals are the SAME `Signal` type (with `source: 'soft'`). They are
combined with hard signals in `src/health/combine.ts`, which calls the engine's
**exported, frozen `rollUp`** — it does not reimplement risk logic. So soft signals
are treated by exactly the same rules as hard ones, and the crown jewel is untouched.
`SignalType` gained four soft literals and `Signal` an optional `source` field; both
are additive and change no threshold or logic.

## 15. Two Claude jobs, kept strictly separate

- **Soft-signal extractor** — strict JSON out, validated against a fixed enum,
  temperature 0. Risk-polarity soft signals are **severity-clamped to `warning`** so
  an LLM signal can never solo-red an account (it can only stack). See
  PHASE2_SIGNAL_PROPOSALS.md #2 for revisiting this ceiling.
- **Reasoning writer** — given ONLY the fired signals, narrates the "why". A
  `validateReasoning` guard scans the output for language describing risks that did
  NOT fire; if it finds any (a hallucination), the model output is **rejected** and a
  deterministic, trivially-faithful summary composed from the fired signals is used
  instead. Faithfulness is enforced by construction, not hoped for.

## 16. Independent switches

`DATA_SOURCE=mock|live` and `ANSWER_ENGINE=mock|claude` are resolved separately, so
live data + mock answers (or vice versa) is a valid debugging combination.

## 17. Ask-anything: Claude picks IDs, our data supplies the truth

`ClaudeAnswerEngine` lets Claude phrase the answer and choose relevant account IDs,
but risk levels and reasons in the result are read from OUR evaluated data — the
model can't misreport an account's health, and invented IDs are dropped.

## 18. Graceful degradation is per-source

The CRM account list is the only fatal dependency; every other fetch (contacts,
opportunities, tickets, Gong calls) degrades to empty independently on failure. An
`assembleAccount` failure emits a shape-complete minimal record rather than sinking
the book. HTTP clients retry 429/5xx with backoff (honoring `Retry-After`) and map
401/403 to a typed `SourceUnavailableError`.

## Phase 2 bug caught by the tests (kept honest)

- A `combine` test fixture set `activeUsers: 40` on an account whose usage history
  still described 75 users, so it unintentionally tripped `usage_decline` (critical)
  and read red instead of the intended single-warning yellow. The test fixture was
  wrong, not the engine — fixed the fixture's usage history to match. Good reminder
  that the frozen engine does exactly what it says.

---

# Phase 3 Decisions — product depth + leadership + design

## 19. Six new hard signals, all in the pure registry

`engagement_cadence`, `email_responsiveness`, `feature_depth`, `stickiness_decline`,
`onboarding_stalled`, `billing_friction` — each a pure `(account, thresholds, now) =>
Signal | null` appended to `SIGNAL_REGISTRY`, thresholds-as-data, exhaustively tested
(fires / silent / boundary), and cold-start-gated where it needs a baseline.
`onboarding_stalled` is deliberately NOT cold-start-gated (it's about new accounts)
but only fires *after* the activation window, so a brand-new account never trips it.
Severities stay conservative (mostly `warning`; billing escalates to `critical` only
when an invoice is both overdue AND disputed) so no single new signal solo-reds an
account — they stack.

## 20. `renewal_risk` v2 + `rollUp` v2 — the one approved change to the crown jewel

Renewal severity is now **jeopardy-tiered** (critical when imminent / high-ARR /
stacked, else warning) and `rollUp` treats renewal as an **amplifier**, not a
stacking driver: red = a non-renewal critical, OR ≥2 non-renewal warnings, OR a
critical-tier renewal. This makes a far-off, low-value, single-risk renewal read
yellow rather than red — the product-correct behavior the owner approved. Every
Phase 1 signal's own tests are unchanged; only the renewal roll-up moved, plus two
mock accounts (`relecloud`, `margiestravel`) flipped red→yellow as designed.

## 21. New normalized fields are REQUIRED, and BOTH sources emit them

`responsiveness`, `featureUsage`, `activatedAt`, `billingFlags`, `ownerCsm`,
`priorArr`, `lifecycleState`, and `UsageSnapshot.logins` were added as required
domain fields (empty-safe defaults). The mock generator populates them richly; the
live adapter maps each from custom fields / Gong / defaults. Making them required
(not optional) keeps the anti-drift contract test strong — mock and live stay
key-for-key identical. The three leadership-only fields (`ownerCsm`, `priorArr`,
`lifecycleState`) are never read by the signal engine.

## 22. Soft signals reach RiskLevel only through typed Signals — mock path included

To render soft signals in the credential-free demo, `MockSoftSignalExtractor`
(deterministic, keyword-over-interactions, evidence-grounded) mirrors the Claude
extractor and feeds the same `combineEvaluation` roll-up. So the browser demo shows
hard+soft stacking (e.g. `feature_depth` + `competitor_mention` → red) with no API
key, and the guardrail holds: free-text never sets risk; only a typed `Signal` does,
clamped to `warning`.

## 23. Leadership is a separate pure module, not an engine change

`src/leadership/metrics.ts` consumes `EvaluatedAccount[]` and computes NRR/GRR,
distribution (counts + dollars), coverage, book balance, at-risk-without-activity,
expansion, quarterly renewals, churn reasons (inferred from fired signals), and
segment/CSM breakdowns — all pure, unit-tested, zero UI/vendor deps, and it never
touches the engine. NRR/GRR come from `priorArr` vs `arr`; churn reasons come from
the signals that actually fired, not a CRM picklist. "Health trend" and expansion
sizing are modeled and labeled as such in the UI (the A4 transparency ethos).

## 24. Team-visibility framing is coverage, not surveillance

Every leadership team section is labeled around "where accounts need support" and
"where to rebalance", never "who isn't working" — a deliberate product decision, in
the UI copy, because our actual users are the CSMs and adoption dies if it reads as
monitoring.

## 25. Design identity: cool slate + one indigo accent; health & money are loudest

See `DESIGN.md`. Tokens (palette, type scale, elevation, radius, motion) are defined
once in `tailwind.config.js` and applied consistently. Health state is triple-encoded
(color + shape + label) so it survives colorblindness; the health palette was picked
by running the dataviz validator, not by eye. Money numbers use a hero type scale
with tabular figures. Charts follow the dataviz method (honest marks, 2px gaps,
labels/legends, no chartjunk).

---

# Phase 4 Decisions — SignalOS visual language + honest MVP scoping

Prime directive: match the SignalOS vision screens' look and feel, but **only
populate fields we can truthfully derive from the MVP integrations** (CRM, Gong,
email/calendar, help desk, Slack). Beauty yes; fake data no.

## 26. What we CUT (needs eng/incident/observability tooling we don't connect)
The entire TAM *engineering* dashboard: engineering P1/P2 incident counts, the
"Integration Health Score", eng technical escalations, TAM capacity/workload
planning, "Where to Deploy TAMs", "Top Recurring Engineering Issues" (connector/
webhook/API telemetry), and the eng "Technical Risk Score" bubble. These require
PagerDuty / observability / eng-Jira, which are explicitly out of the MVP. A clean
architectural spot is left for a future **premium technical tier**; nothing is built.

## 27. What we SOFTENED (needs the product-usage warehouse we don't have)
- **Expansion → "Expansion Signals," not a valued pipeline.** No stage funnel, no
  weighted forecast, no 0–100 expansion score, no "multi-product fit," no
  "usage 2.4× above average / unused seats %". We show the honest signals we can see
  (champion strength from Gong, buying language, open CRM opps, new stakeholders) and
  a dollar amount **only** when a real CRM opportunity exists (`CrmOpportunity`).
- **Deep-usage widgets downgraded.** No WAU charts, no "Product Adoption /100", no
  login-stickiness/feature-depth hero charts on the surface. On the account detail the
  vision's "Product Adoption" and "Technical Stability" tiles are replaced by
  **Engagement** (Gong/email) and **Support Health** (help desk) — both honestly
  sourceable — and metric tiles are **qualitative** (Critical/At Risk/Healthy,
  Low/Medium/High), never a fabricated warehouse-grade number.
- **Support & Technical Attention kept, but LIGHT** — help desk + Slack only: tickets
  needing attention, SLA breach/aging, and the honest **ticket → account-risk** link
  (an account surfaces here only when a `support_strain`/`support_sentiment` signal
  actually fired). Footer states plainly that deep eng incident data is a future tier.

## 28. Trends & sparklines — the honesty rule for a fresh MVP
A newly-onboarded customer has point-in-time integration data, not month-over-month
history, so period-over-period deltas would be fabricated on day one. Decision
(owner-approved): **thin-data / cold-start accounts render NO sparkline**; the demo
seeds a **modeled** short `trendSeries` so localhost shows the full sparkline look,
and it is documented here + in `DESIGN.md` as modeled-for-demo. `trendSeries` is empty
for cold-start accounts (they show a "—"), and it is never presented as a
warehouse-grade usage figure. In production the series accrues as SignalOS runs.

## 29. New fields stay honestly sourceable and shape-identical
`SupportTicket[]` (help desk), `CrmOpportunity[]` (CRM), `Contact.engagement`
(Gong/email), and `trendSeries` (modeled) are all additive and emitted by BOTH the
mock and the live adapter, so the anti-drift contract test still holds. The signal
engine's inputs are unchanged (ticket **counts** still drive `support_strain`); the
new ticket **objects** are UI/support-module detail only — the crown jewel is untouched.

## 30. Navigation reproduces the SignalOS shell; unbuilt items are disabled
The left nav shows the full SignalOS item set. The six screens we build are clickable
(Home, Accounts, Renewals, Opportunities, Technical Health, Executive View); Playbooks,
Alerts, and Settings are shown but **non-clickable (disabled)** so the shell matches the
vision without pretending features exist. "Ask" is wired to the top-bar search.

## 31. Phase 5 — first real integrations (Merge CRM + Ticketing); Slack deferred
Wired the live path to **Merge unified API** for real CRM (backbone: accounts, ARR,
renewals, owner→CSM, segment, contacts, opportunities) and **help-desk Ticketing** (a
separately-connected Merge category). One Merge client, two adapters
(`MergeCrmSource`, `MergeTicketingSource`) sharing the SAME pure mappers the composite
`UnifiedApiDataSource` already used, so mock and live cannot diverge (contract + seam
tests enforce it). **Slack was explicitly deferred by the owner** ("only email is
fine") — documented in `SETUP_SLACK.md`, no Slack code paths added.

## 32. SLA is derived, ticket tone is neutral (owner-approved honesty calls)
Help desks don't emit a uniform SLA field or sentiment, so we **derive** `slaStatus`
(`breached`/`at_risk`/`ok`) from due date + resolved state, and we set ticket `tone`
to **`neutral`** always rather than fabricating sentiment from help-desk text. Both are
documented in `DATA_HANDLING.md`. The signal engine is **untouched**: ticket *counts*
still feed `support_strain`; the new ticket *objects* are UI/support detail only.

## 33. Per-source connection status added to the DataSource seam
Added `connections(): SourceConnection[]` to the `DataSource` interface
(`connected` / `not_connected` / `cold_start`), threaded through the server payload,
`BookProvider`, `useBook`, and a "Data Sources" panel in the app shell — so the UI can
**honestly** show which integrations are live vs. cold-start vs. not connected, instead
of implying everything is wired. Mock reports a single "Sample data: connected" source.

---

# Phase 7 Decisions — admin console: integrations, roles, thresholds, security

## 34. Auth/roles/admin-console architecture, in one place

**Role semantics.** Four roles, no permissions matrix yet: `csm` (own book only,
scoped by `Account.ownerCsm === user.name` — CRM is the source of truth for
ownership, so a CSM's identity for scoping purposes IS their CRM owner name, not a
separate mapping), `manager` (their assigned CSMs' books only — `User.managedCsmNames`,
a list of `ownerCsm` name strings the admin assigns on the Users page; a manager with
no assignments sees nothing, never "the whole org by accident"), `exec` (whole org,
unscoped, plus Executive View), `admin` (everything `exec` sees, plus the Admin
Console). Admin implies exec-level visibility so an admin is never blocked from a page
they administer.

**CSM-to-account assignment stays CRM-owner-driven, read-only.** The Users & Roles
page displays `ownerCsm` from the book; it does not let an admin reassign an account's
owner. Reassigning would create a second, divergent source of truth from the CRM's own
owner field and the existing "Book Balance by CSM" leadership widget (`workloadByCsm`,
Phase 3) — both already read `ownerCsm` directly. A manager's `managedCsmNames`, by
contrast, IS admin-managed: "which CSM names does this manager oversee" has no CRM
equivalent to conflict with.

**Credential storage: extended the existing `TokenStore`/AES-256-GCM pattern, not a
database.** `integrations/auth/tokenStore.ts`'s `Provider` type gained `'ticketing'`
(Ticketing is a separately-connected Merge category, same as CRM/Salesforce/Gong).
User accounts and sessions got their own equally-small interfaces — `UserStore`
(scrypt-hashed passwords, `node:crypto`, no new dependency), `SessionStore` (opaque
random bearer tokens, server-revocable), `InviteStore`, `ThresholdStore`,
`AuditLogStore`, `OrgSettingsStore`, and an `IntegrationsStore` (mock simulates all
five cards; live drives `crm`/`helpdesk` through the real `TokenStore`, and honestly
reports `slack`/`google`/`microsoft` as having no live flow — see #36). Every one of
these is in-memory (`InMemory*`) for this phase, same as `MockDataSource` always was —
no database was stood up. A Postgres-backed implementation drops in behind each
identical interface later, the same seam `DataSource` has always used. This keeps the
zero-infra, zero-credential demo story intact: `npm run dev` still needs nothing.

**Single-org per deployment, for now.** `User.orgId` and every store's `orgId`
parameter exist because the domain model should be multi-tenant-shaped, but the rest
of this codebase (one `.env`, one `ServerConfig`, one `DataSource` instance) is
single-tenant per deployment. `server/orgId.ts`'s `DEFAULT_ORG_ID` is the one place
that assumption lives; every store already takes `orgId` as a real parameter, so
resolving it per-request (subdomain, path, etc.) later doesn't touch call sites.

**Threshold-config: zero engine changes — the seam already existed.** Phase 1
decision #6 already made `resolveThresholds(override)` and `buildBook({ thresholds })`
pure, injected, engine-untouched. The ENTIRE Phase 7 threshold refactor was adding
`ThresholdStore` (persist a per-org partial `ThresholdOverride`) and wiring
`BookService.getBook()` to resolve it before calling `buildBook` — see
`service.thresholdFlow.test.ts`, which proves an admin-set override flips a
previously-silent signal to firing without a single line of `engine/` changing.

## 35. Auth is hard-gated server-side for the two surfaces the brief singles out; base pages stay backward-compatible

`GET /api/leadership` (Executive View's data) and every `/api/admin/*` route are
gated with `requireRole(...)` **unconditionally** — a request with no session, an
expired session, or the wrong role gets 401/403 regardless of what the SPA hides
(`roleGating.test.ts` hits the real Express app over HTTP to prove this, not just
"the nav link is hidden"). `GET /api/accounts` / `POST /api/ask`, by contrast, stay
**callable without a session** — every Phase 1–6 test exercised them unauthenticated,
and breaking that would both violate "prior-phase tests stay green" and kill the
zero-login instant demo every phase before this one relied on. When a valid session
IS presented, `/api/accounts` applies role-based book scoping
(`server/bookScope.ts`) so an authenticated `csm`/`manager` sees only their book.
Client-side, `AuthGate` still requires login for the WHOLE app whenever a backend is
configured (`VITE_BACKEND_URL` set) — the zero-backend `LocalBookProvider` demo
(no `VITE_BACKEND_URL`) is unchanged from before Phase 7: no login, no roles, no
admin console, because there is no server to enforce any of it against.

## 36. Slack/Google/Microsoft integration cards are honest about not being built

Only CRM and Help Desk (both Merge) have a real live connect flow (`MergeLinkService`,
Phase 5). Slack, Google Workspace, and Microsoft 365 have no OAuth implementation
anywhere in this codebase — Slack was explicitly deferred in Phase 5
(`SETUP_SLACK.md`); Google/Microsoft were never started. Their Integrations-page cards
say so (`liveFlowAvailable: false`, "No live connect flow is built for this
integration yet"), and `LiveIntegrationsStore.connect()` throws rather than faking a
connection in live mode. In **mock** mode, all five cards DO simulate a connected
state — the phase brief's requirement that the whole console demo with zero
credentials — but that's a demo affordance, not a claim that the flow is real.

## 37. Invites are logged, not emailed — no email service exists yet

`LoggingMailer` logs `[stub] invite email not sent` instead of delivering anything;
`NEXT.md` records this as a followup. The invite record itself is real (persisted,
drives the pending-invites list, and `POST /api/auth/accept-invite` genuinely creates
the account with the invited role) — only the delivery channel is stubbed.

---

# Phase 8 Decisions — invite flow completion: real email + accept screen

## 38. Email provider: Resend, owner-approved

Chosen over SendGrid for lower setup friction and a free tier that comfortably
covers transactional invite volume — see `SETUP_EMAIL.md` for the full comparison.
Delivery goes through a raw `fetch` call to `api.resend.com` (`ResendEmailService`,
`src/auth/emailService.ts`), not the `resend` npm SDK — same "typed HTTP client, no
vendor SDK" posture as the Merge/Gong clients. No `EMAIL_API_KEY` → falls back to
`LoggingEmailService` (Phase 7's log-only behavior), so local dev and CI stay
credential-free, matching how every other integration in this app degrades
gracefully without live credentials.

## 39. Invite token model: separate random token, 90-day expiry, status-based single-use

Phase 7's `Invite.id` (a sequential `invite-N`) doubled as the accept token —
guessable, no expiry, and the record was **deleted** on accept so the admin console
could never show "Accepted", only "Pending" (or nothing). Phase 8 fixes all three:

- **`token`** is a separate `randomBytes(32)` base64url value (same generation as
  session tokens), distinct from `id`. `id` stays a stable, non-secret row
  identifier for admin actions (resend); `token` is the actual secret the accept
  link carries, and it rotates on resend (the old link stops working immediately).
- **`expiresAt`**: 90 days from creation (owner-specified, overriding the initially
  proposed 7-day default).
- **`status: 'pending' | 'accepted' | 'expired'`**, computed at read time from
  `expiresAt` (never a background job) and set to `'accepted'` on use. The record
  stays after acceptance instead of being deleted, so the Users & Roles page shows
  real invite history, not just a shrinking pending list.
- Single-use is enforced by **status**, not deletion — `acceptInvite` re-validates
  through the same `validateInviteToken` the public "show me the org/role" endpoint
  uses, so the two paths can never disagree about what's valid.

## 40. Invite-creation response never returns the token

`POST /api/admin/users/invite` returns `{ inviteId, emailSent, emailError }` —
**not** the token. The only ways to obtain a token are (a) the email itself, or (b)
the admin-only `GET /api/admin/users` listing (which DOES include it, since an admin
already has full access to invite the same person). This keeps the token out of
response logs / browser history for the common path while still letting an admin
manually share a link if email delivery fails.

## 41. A failed send never loses the invite

The invite record is always persisted **before** `EmailService.sendInvite` is
attempted (`inviteUser`/`resendInvite` create/regenerate the record first; the route
composes and sends the email second). A send failure is caught and returned as
`{ emailSent: false, emailError }` — never a 500 that would suggest the invite
itself failed. The admin sees this in the Users & Roles page and can hit **Resend**
once the provider issue is fixed, or share the link manually. `AuthService` itself
holds no logger and never touches email at all (decoupled — see #42), so it cannot
leak anything through a send-failure path.

## 42. `AuthService` no longer sends email — the HTTP layer composes it

Phase 7's `AuthService.inviteUser` called the mailer directly with just an email/
role. Phase 8's email needs org name and inviter name, which `AuthService` doesn't
hold (no `OrgSettingsStore`, no access to "who is calling"). Rather than threading
those into the auth layer, `inviteUser`/`resendInvite` now just return the `Invite`
(token included), and `src/server/http.ts`'s `sendInviteEmail()` helper composes the
message using `req.user!.name` (already available) and `admin.orgSettings.get()`.
Keeps `AuthService` framework-agnostic and testable with zero HTTP, same as before.

## 43. Accept-invite is the one URL-addressable route in an otherwise state-routed SPA

The app has never used a router library — navigation is in-memory `Route` state
(Phase 1 onward). Phase 8 needed exactly one real URL (`/invite/:token`, reachable
while signed out) and added the smallest possible mechanism for it: a `Router`
component in `App.tsx` that regex-matches `window.location.pathname` once, with no
new dependency. Once acceptance flips auth status to `signed-in`, the URL is
cleared via `history.replaceState` so a refresh doesn't re-show the accept screen.
An already-signed-in user hitting a stale invite link just sees the normal app —
invite links are for new users, and this avoids a confusing state overlap.

## 44. Landing page by role, on both login and invite-accept

`landingRoute(role)`: `csm`/`manager` → Home (Portfolio), `exec` → Executive View,
`admin` → the Admin Console they were invited to run. Applied uniformly to
`AppContent`'s initial route state, so it's the same behavior whether someone signs
in directly or arrives via `/invite/:token` — one rule, not two.
