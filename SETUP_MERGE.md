# Connecting real data via Merge (CRM + Help Desk)

The live data source reads from **[Merge](https://merge.dev)**, a unified API that
sits in front of many CRMs (Salesforce, HubSpot, …) and help desks (Zendesk,
Intercom, Freshdesk, …). You connect a customer's tools **once** in Merge, and this
app reads normalized data from two Merge categories — **CRM** and **Ticketing** —
behind a single linked account.

You do **not** need Salesforce or Zendesk API credentials directly. Merge handles the
vendor OAuth and token refresh; we only hold a Merge access key + a linked-account
token.

## 1. Create a Merge account

1. Sign up at <https://app.merge.dev/signup> (free developer/test tier).
2. In the dashboard, go to **Keys** and copy your **Production/Test Access Key**.
   → this is `MERGE_ACCESS_KEY`.

## 2. Connect a test CRM (the backbone)

Merge provides sandbox integrations so you can test without a real Salesforce org.

1. In the Merge dashboard, open **Linked Accounts → Add Test Linked Account**
   (or use **Merge Link** to connect a real CRM).
2. Choose a **CRM** integration (e.g. the Salesforce sandbox or Merge's sample data).
3. Complete the connect flow. Merge issues an **Account Token** for that linked
   account → this is `MERGE_ACCOUNT_TOKEN`.

That single linked account is the backbone: accounts, ARR, renewal dates, owner (→
CSM), segment, contacts, and opportunities.

## 3. (Optional) Connect a test help desk (Ticketing)

Support tickets are a **separate Merge category** on the same linked account:

1. Still in **Linked Accounts**, add a **Ticketing** integration (e.g. Zendesk
   sandbox or sample data) for the same customer.
2. No new env var is needed — the same `MERGE_ACCOUNT_TOKEN` exposes the Ticketing
   category once it's connected.

If Ticketing is **not** connected, the app still runs fine: accounts simply show
zero tickets and the UI's Data Sources panel reads **"Merge Ticketing: not
connected."** Nothing crashes.

## 4. Configure environment

Copy `.env.example` to `.env` and set:

```bash
DATA_SOURCE=live
MERGE_ACCESS_KEY=<your Merge access key>
MERGE_ACCOUNT_TOKEN=<the linked-account token>
# Defaults are Merge's public endpoints; override only for EU/self-host:
# MERGE_CRM_BASE_URL=https://api.merge.dev/api/crm/v1
# MERGE_TICKETING_BASE_URL=https://api.merge.dev/api/ticketing/v1
```

`ANSWER_ENGINE` and Gong are independent — leave them on `mock`/unset to test the
CRM+ticketing integration in isolation.

## 5. Run in live mode

```bash
npm run server      # backend on :8787, now reading live Merge data
# in another shell, point the SPA at it:
VITE_BACKEND_URL=http://localhost:8787 npm run dev
```

Open the app. The left-nav **Data Sources** panel shows the honest status:

- **Merge CRM — Connected** (green) once accounts sync, **Cold start** (yellow) if the
  linked account has zero accounts yet, **Not connected** (grey) before the first sync.
- **Merge Ticketing — Connected / Cold start / Not connected** independently.

## Field mapping (vendor → domain)

Everything below happens inside `src/data/live/` mappers. No vendor field name leaves
that directory (enforced by `seam.test.ts`).

### CRM → `Account`

| Domain field | Merge source | Notes |
|--------------|--------------|-------|
| `id` | account `id` | |
| `name` | `name` | defaults to "Unnamed account" when null |
| `arr` | `custom_fields.arr` (several key/casing fallbacks) → else sum of **WON** opportunities | never modeled from usage |
| `renewalDate` | `custom_fields.renewal_date` variants | |
| `segment` | derived from `number_of_employees` | smb / mid_market / enterprise |
| `licensedSeats`, `activeUsers` | `custom_fields` seat/usage keys | absent → 0 |
| `contacts[]` | Merge Contacts for the account | champion inferred from flag or title |
| `opportunities[]` | Merge Opportunities | the only honest expansion-dollar source |
| `ownerCsm` | account owner | |

### Ticketing → `SupportTicket`

| Domain field | Merge Ticketing source | Notes |
|--------------|------------------------|-------|
| `subject` | ticket `name` | defaults to "Support ticket" |
| `severity` | `priority`: URGENT→p1, HIGH→p2, else p3 | coarse, deterministic |
| `resolved` | `status === CLOSED` | |
| `slaStatus` | **derived** from `due_date` vs. now + resolved | breached / at_risk (≤24h) / ok — not a copied field |
| `tone` | **always `neutral`** | help desks don't emit sentiment; documented gap |
| `openTickets` / `criticalTickets` | counts of open / open+p1 | the only ticket inputs the signal engine consumes |

## What lives where

- `src/data/live/MergeCrmSource.ts` — CRM-only `DataSource`.
- `src/data/live/MergeTicketingSource.ts` — Ticketing enricher (grouped by account).
- `src/data/live/ticketMappers.ts` — pure vendor-ticket → domain mapping + SLA derivation.
- `src/data/live/mappers.ts` — CRM assembly into the normalized `Account`.
- `src/data/live/UnifiedApiDataSource.ts` — composite live source (CRM + Ticketing + Gong).

See `DATA_HANDLING.md` for what is (and isn't) persisted.
