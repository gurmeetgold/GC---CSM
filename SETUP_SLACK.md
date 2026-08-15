# Slack integration — DEFERRED

**Status: not built in this phase.** The Phase 5 owner decision was explicit:
*"Leave the Slack integration for now. Only email is fine."* This document records the
intended design so it can be picked up later without re-deciding anything.

There is **no Slack code, no Slack token handling, and no Slack data flow** in the
current build. `SLACK_BOT_TOKEN` appears in `.env.example` only as a commented
placeholder and is read by nothing.

## Why deferred

- Email/CRM/help-desk cover the honest signals we ship today (engagement,
  responsiveness, support strain, renewals).
- Slack adds real value (deal-room activity, champion silence in shared channels) but
  needs its own OAuth app, scopes review, and a privacy stance on message content —
  out of scope for "first real integrations."

## Intended design (for later)

- A `SlackSource` **enricher** (not a standalone `DataSource`), mirroring
  `MergeTicketingSource`: fetch → map → group by account → discard raw, returning
  domain objects only. It would feed engagement/interaction data, never raw messages
  into the store.
- Direct Slack OAuth (Slack isn't a Merge category), a bot token per workspace stored
  **encrypted** via the existing `TokenStore` (same AES-256-GCM path as Merge/Gong
  tokens — see `DATA_HANDLING.md`).
- Shape-identical output: whatever Slack contributes must map into the existing
  normalized domain (e.g. `Contact.engagement`, `interactions[]`) so the anti-drift
  contract test keeps holding. **No Slack/vendor field names past the adapter.**
- A `connections()` entry ("Slack — connected / not connected / cold_start") so the
  Data Sources panel stays honest.

## When you pick this up

1. Create a Slack app, request the minimal read scopes, install to a test workspace.
2. Add `SlackSource` under `src/data/live/` with pure mappers + fixture tests
   (vendor payload → exact domain objects), following the Merge adapter tests as the
   template.
3. Thread its `connections()` into `UnifiedApiDataSource` alongside Merge/Gong.
4. Document the data flow and privacy stance in `DATA_HANDLING.md`.
5. Record the decision in `DECISIONS.md`.
