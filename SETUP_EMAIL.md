# Setting up real invite emails (Resend)

Phase 8 closes the Phase 7 "known gap": invites are no longer log-only. Real delivery
goes through **[Resend](https://resend.com)** — chosen (owner-approved) over SendGrid
for a smaller B2B transactional use case:

| | Resend | SendGrid |
|---|---|---|
| Setup friction | Low — API key + optional domain verification | Higher — no zero-config sandbox, must verify a sender/domain before anything sends |
| Free tier | 3,000 emails/mo, 100/day — comfortably covers invite volume | No meaningful permanent free tier anymore (trial-based) |
| SDK / API | Modern, TypeScript-native, simple JSON API | Older, heavier API surface |
| Zero-domain test mode | Yes — `onboarding@resend.dev` sandbox sender works immediately | No |
| Deliverability (transactional) | Solid | Solid, more enterprise features (dedicated IP, deep analytics) we don't need here |

Without `EMAIL_API_KEY` set, invites fall back to **`LoggingEmailService`** — the
exact log-only behavior Phase 7 shipped. Nothing breaks, nothing errors: local dev
and CI stay credential-free.

## 1. Sign up

Create a free account at <https://resend.com/signup>.

## 2. Sending domain — or use the sandbox for now

**If you own a domain** you want invites to come from: **Domains → Add Domain**,
add the DNS records Resend gives you (SPF/DKIM), wait for verification (usually
minutes). Then set `EMAIL_FROM="SignalOS <invites@yourdomain.com>"`.

**If you don't have a domain ready yet** (honest flag, not a blocker): Resend's
sandbox sender `onboarding@resend.dev` works with **zero domain setup** and is the
default `EMAIL_FROM` if you don't set one. It can only send to the email address on
your Resend account while in sandbox/test mode — fine for developing and testing
this phase, not for real customer-facing invites. Verify a domain before sending
invites to real teammates.

## 3. Get an API key

**API Keys → Create API Key** (Sending access is enough). Copy it — it's shown once.

## 4. Configure environment

```bash
EMAIL_API_KEY=re_your_key_here
EMAIL_FROM="SignalOS <onboarding@resend.dev>"   # or your verified domain sender
APP_BASE_URL=http://localhost:5173               # where the SPA lives — used to build the /invite/:token link
```

Add these to `.env` (never commit the key — `.env.example` only has placeholders).

## 5. How it's wired

- `src/auth/emailService.ts` — `EmailService` interface, `LoggingEmailService`
  (fallback), `ResendEmailService` (real send via raw `fetch` against
  `api.resend.com` — no `resend` SDK dependency, same "typed HTTP client, no vendor
  SDK" style as the Merge/Gong clients).
- `src/server/adminServices.ts` — picks `ResendEmailService` when `EMAIL_API_KEY` is
  set, else `LoggingEmailService`. No code branches elsewhere.
- `src/server/http.ts`'s `sendInviteEmail()` composes the message (org name, inviter
  name, role, accept link) and never throws — a send failure returns
  `{ emailSent: false, emailError }` in the API response so the admin sees it and can
  hit **Resend** in the Users & Roles page; the invite record itself is never lost.

## 6. Send yourself a real test invite

1. Set the three env vars above, verify your own email as the sandbox recipient (or
   use a verified domain).
2. `DATA_SOURCE=mock npm run server` (or `live`, independent of email).
3. `VITE_BACKEND_URL=http://localhost:8787 npm run dev`, sign in as an admin.
4. **Admin Console → Users & Roles → Invite a teammate** — invite your own email.
5. Check your inbox for "`<Your Name>` invited you to `<Org>` on SignalOS" —
   click **Accept your invite**.
6. You land on `/invite/:token`, see the org/role, set a name + password, and are
   signed in as the invited role immediately.
