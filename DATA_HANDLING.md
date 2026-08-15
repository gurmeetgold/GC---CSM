# Data Handling

How the live path treats customer data, secrets, and LLM traffic. This is the seed
of the SOC 2 story: what is persisted, what is not, and where secrets live.

## Principle: transient by default

We compute risk signals from customer data in memory and do **not** persist raw
customer records. The normalized `Account` objects exist for the lifetime of a
request/evaluation and are not written to any datastore in this phase.

## What is persisted

| Data | Persisted? | Where | Notes |
|------|-----------|-------|-------|
| Integration tokens (Merge account tokens, Gong auth) | **Yes** | `TokenStore`, encrypted at rest | AES-256-GCM; see below |
| Raw Salesforce records (accounts, contacts, opps, tickets) | **No** | — | Fetched transiently, mapped, discarded |
| Raw Gong calls / transcript text | **No** | — | Used transiently for soft-signal extraction, then discarded |
| Computed signals / risk levels | Not in this phase | in-memory only | A future cache would store computed signals, never raw transcripts |
| LLM prompts / completions | **No** | — | Anthropic zero-data-retention tier; we don't log them either |
| Secrets (API keys, client secrets) | **Yes** | env / secret store | Never in code, never logged |
| User passwords (Phase 7) | **Yes, as a hash** | `UserStore`, in-memory | scrypt (`node:crypto`), random salt per user; the `User` domain type has no password field at all — a hash is never returned by any read path |
| Session tokens (Phase 7) | **Yes** | `SessionStore`, in-memory | Opaque random bearer tokens, 12h TTL, server-revocable on logout — not JWTs, so nothing to cryptographically "expire early" |
| Admin-edited signal thresholds (Phase 7) | **Yes** | `ThresholdStore`, in-memory | A partial `ThresholdOverride` per org; not a secret, stored plain |
| Audit log (integration connect/disconnect, role changes, threshold edits) (Phase 7) | **Yes** | `AuditLogStore`, in-memory | Actor email + action + target + timestamp; no payload content |

## Secrets

All credentials come from environment / a secret store, never from source:

- `MERGE_ACCESS_KEY`, `MERGE_ACCOUNT_TOKEN` — Merge unified CRM access.
- `MERGE_CRM_BASE_URL`, `MERGE_TICKETING_BASE_URL` — Merge endpoints.
- `GONG_BASE_URL`, `GONG_AUTHORIZATION` — Gong access.
- `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` — Claude (zero-data-retention tier).
- `TOKEN_ENCRYPTION_KEY` — 32-byte base64 master key for token encryption at rest.

`resolveServerConfig()` reads these; `assertLiveConfig()` fails startup loudly if a
selected live mode is missing its secrets. Config is **server-side only** — the
browser bundle never imports it, and the two live modules that carry secrets
(`src/data/live/httpClients.ts`, `src/answer/claude/claudeClient.ts`) are never
imported by browser code (verified by the build: the SPA bundle excludes them).

### Passwords and session tokens (Phase 7)

- Passwords are hashed with **scrypt** (`node:crypto`, no new dependency) —
  `src/auth/passwords.ts`. A random 16-byte salt per user; the stored format is
  self-describing (`scrypt.<saltB64>.<hashB64>`) so the KDF can be rotated later.
  `verifyPassword` uses a constant-time comparison (`timingSafeEqual`).
- The `User` domain type (`src/domain/user.ts`) **has no password field** — a hash
  can never leak through a `User` read path even by accident; `UserStore` keeps
  password hashes in an internal row shape a caller never sees.
- Session tokens are 32 random bytes (`crypto.randomBytes`), not JWTs — a session is
  revoked by deleting it server-side (`SessionStore.destroy`), so logout is
  instantaneous and doesn't depend on client cooperation or a token blocklist.
- `credentialStorage.test.ts` proves (a) no plaintext password is ever reachable
  through `UserStore`'s read methods, (b) login/invite/accept-invite never log the
  plaintext password to console, and (c) `TokenStore` ciphertext never contains the
  plaintext token.

## Encryption at rest

Integration tokens are encrypted with **AES-256-GCM** (`src/integrations/auth/crypto.ts`):

- Random 96-bit IV per encryption; authentication tag verified on decrypt (tampering
  is rejected).
- Ciphertext is versioned (`v1.<iv>.<tag>.<ct>`, base64) to allow key rotation.
- The master key is loaded from `TOKEN_ENCRYPTION_KEY` and validated to be exactly
  32 bytes. Keys and plaintext tokens are never logged.

The dev `EncryptedInMemoryTokenStore` still encrypts values (proving the path and
keeping plaintext out of memory dumps). A Postgres-backed `TokenStore` swaps the
Map for a table behind the identical interface.

## Logging discipline

- No tokens, secrets, prompts, completions, or raw transcript text are logged.
- The unified data source's logger is wrapped by `sanitize()` in the server factory,
  which redacts any metadata key matching `/token|secret|key|authorization/i` as a
  belt-and-suspenders guard.
- Vendor errors are logged as typed `SourceUnavailableError` (vendor + reason +
  status), never with response bodies.

## OAuth / connect flow

The "Connect Salesforce / Gong" flow uses **Merge Link**, so we never handle vendor
client secrets or refresh loops ourselves:

1. Backend mints a short-lived link token.
2. The customer authorizes the vendor in Merge Link.
3. Merge returns a `public_token`; the backend exchanges it for a durable
   `account_token`, which is stored **encrypted** via the `TokenStore`.

Tokens are scoped by `orgId` + provider and can be individually deleted (disconnect).

## Phase 5: Merge CRM + Ticketing data flow

The live source assembles the **same normalized `Account`** the mock emits, from two
Merge categories behind one linked account:

- **CRM (backbone).** Accounts, ARR, renewal dates, segment, owner→CSM, contacts, and
  opportunities. A CRM failure is fatal to the book (there's nothing to render).
- **Ticketing (optional, separate connection).** Support tickets → domain
  `SupportTicket`. Degrades to zero tickets independently if not connected.

What crosses the adapter (and what does **not**):

| Domain field | Derived from | Honesty note |
|--------------|--------------|--------------|
| `tickets[].slaStatus` | **Derived** from `due_date` vs. now + resolved state | We do **not** copy a vendor "SLA" field — help desks vary; we compute `breached` / `at_risk` / `ok` ourselves. |
| `tickets[].severity` | Mapped from Merge `priority` (URGENT→p1, HIGH→p2, else p3) | Coarse, deterministic mapping. |
| `tickets[].tone` | **Always `neutral`** | Help desks don't emit sentiment. We do not fabricate tone; the gap is documented, not guessed. |
| `openTickets` / `criticalTickets` | Counted from mapped tickets (open; open+p1) | These remain the only ticket signal the engine consumes — the engine was **not** changed. |

**No vendor field names leak past the adapter.** `custom_fields`, `remote_id`,
`annual_revenue`, `due_date`, `crm_account_id`, `Licensed_Seats__c`, etc. exist only
inside `src/data/live/` mappers. A seam test (`seam.test.ts`) serializes the live
output and asserts none of these keys appear.

**Token shape.** Merge uses one org-level `MERGE_ACCESS_KEY` plus a per-customer
linked-account token (`MERGE_ACCOUNT_TOKEN`). The same linked account exposes both CRM
and Ticketing categories — one connection, two adapters. Nothing about ticket contents
is persisted; tickets are fetched, mapped, counted, and discarded per request.

**Slack: deferred.** No Slack data is fetched, stored, or transmitted in this phase.
See `SETUP_SLACK.md`.

## Phase 7: who can see what (roles, enforced server-side)

Role gating is not a UI convenience — every gated route rejects an unauthorized
request at the server, independent of what the browser shows (`roleGating.test.ts`
hits the real Express app to prove it):

| Role | Book scope | Executive View | Admin Console |
|------|-----------|-----------------|-----------------|
| `csm` | Own accounts only (`Account.ownerCsm === name`) | ✗ (403) | ✗ (403) |
| `manager` | Assigned CSMs' accounts only (`managedCsmNames`) | ✗ (403) | ✗ (403) |
| `exec` | Whole org, unscoped | ✓ | ✗ (403) |
| `admin` | Whole org, unscoped | ✓ | ✓ |

`GET /api/leadership` and every `/api/admin/*` route require a valid session AND the
right role (401 with no session, 403 with the wrong role). `GET /api/accounts` stays
callable without a session (backward-compatible with the pre-Phase-7 demo) but scopes
its response to the caller's role whenever a session IS presented. See DECISIONS.md
#34–#35 for the full rationale, including why the base account endpoints were kept
open rather than hard-requiring auth.

## LLM data flow (soft signals + reasoning)

- Only interaction **summaries** (bounded to the most recent 25) are sent to Claude,
  not full raw transcripts, and only for accounts that have interaction text.
- Requests go to the Anthropic zero-data-retention tier; neither prompts nor
  completions are retained by the provider or by us.
- Claude output is constrained: soft signals must be typed JSON (anything else is
  dropped) and reasoning is validated to reference only fired signals. Free-text
  never sets risk.
