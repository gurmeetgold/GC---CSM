# Phase 5 Signal Proposals

Signal-engine changes that connecting **real** CRM + help-desk data (via Merge)
suggests. **These are proposed, NOT applied.** Per the phase guardrail, the signal
engine stays pure and untouched — nothing here ships without explicit approval.

Status legend: 🔵 proposed · ⚪ needs data to decide

---

## 1. 🔵 Live CRM has no product-usage telemetry → usage-family signals abstain

**Observation.** With real Merge CRM data, `usageHistory`, `licensedSeats`, and
`activeUsers` are populated only when a customer happens to keep them in CRM custom
fields — most don't. So `usage_decline`, `adoption_gap`, `stickiness_decline`, and
`feature_depth` **abstain** on most live accounts and those accounts look artificially
calm on the adoption dimension. (Phase 2 raised this for usage history; live data
confirms it now spans the whole usage/adoption family.)

**Proposal (not applied).** Two options, either/both:
- (a) **Coarse CRM seat-utilization signal.** Where CRM *does* carry
  `licensedSeats`/`activeUsers`, derive a single coarse `seat_utilization` signal
  (e.g. active/licensed < 0.5) — a deliberately blunt proxy, clearly labeled as
  CRM-sourced, not warehouse-grade.
- (b) **A "no usage telemetry" account state** so the UI distinguishes "adoption is
  healthy" from "we have no adoption data" instead of silently showing green.

**Why wait for you.** (a) adds a new signal to the crown-jewel engine; (b) adds a UI
state. Both change what "green on adoption" means.

---

## 2. 🔵 Real help-desk tickets unlock an SLA-breach signal (today only counts feed the engine)

**Observation.** The Ticketing adapter now produces rich `SupportTicket` objects with
a **derived** `slaStatus` (`breached` / `at_risk` / `ok`). The engine, however, still
consumes only ticket **counts** (`openTickets`, `criticalTickets`) via
`support_strain` — the SLA posture is UI detail and does not influence risk.

**Proposal (not applied).** Add an `sla_breach` hard signal that fires when an account
has one or more **breached** open tickets (optionally amplified by count). This is a
more honest "support is failing this customer" signal than raw open-ticket volume,
which conflates a busy-but-healthy account with a neglected one.

**Why wait for you.** New signal + threshold in the engine. The data is already
mapped, so this is purely an engine decision, not a data-availability one.

---

## 3. ⚪ Ticket tone is neutral-only → support-sentiment soft signal has no help-desk input

**Observation.** Help desks don't emit sentiment, so we set ticket `tone = 'neutral'`
(documented in `DATA_HANDLING.md`). Any `support_sentiment`-style soft signal
therefore gets nothing from tickets and must rely on Gong/email only.

**Proposal (not applied / needs data).** If we later want help-desk sentiment, it must
come from an explicit text-analysis pass (e.g. Claude over ticket bodies) with the same
zero-retention discipline as the reasoning path — **not** from a fabricated per-ticket
tone. Until then, keep tone neutral and let engagement signals carry sentiment.

**Why wait.** Needs a decision on whether to send ticket text to an LLM at all, and a
privacy review — bigger than a threshold change.
