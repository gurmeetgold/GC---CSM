/**
 * Sends the invite email. Phase 7 only had `LoggingEmailService` (no real send —
 * see NEXT.md's "known gap"). Phase 8 adds `ResendEmailService` behind the same
 * small interface, so the provider is swappable and nothing outside this file names
 * "Resend" or its API shape (same isolation the Merge/Gong clients get).
 */

export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  /** Full URL to the accept-invite screen, token included. */
  acceptUrl: string;
}

export interface EmailService {
  sendInvite(input: InviteEmailInput): Promise<void>;
}

export interface EmailServiceLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
}

/** Fallback used whenever no real provider is configured (mock/dev, or tests) — logs
 *  instead of sending, so local dev and CI stay credential-free and frictionless,
 *  matching how every other source in this app degrades gracefully without live creds. */
export class LoggingEmailService implements EmailService {
  constructor(private readonly logger: EmailServiceLogger = console) {}

  async sendInvite(input: InviteEmailInput): Promise<void> {
    this.logger.info('[stub] invite email not sent (no EMAIL_API_KEY configured)', { ...input });
  }
}

export class EmailSendError extends Error {}

export interface ResendConfig {
  apiKey: string;
  from: string; // e.g. "SignalOS <invites@yourdomain.com>" or Resend's sandbox sender
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Real delivery via Resend's HTTP API. A raw `fetch` call, not the `resend` npm SDK —
 * same "typed HTTP client, no vendor SDK" style as `HttpMergeClient`/`HttpGongClient`,
 * and it keeps `fetchImpl` injectable so tests never hit the network.
 */
export class ResendEmailService implements EmailService {
  constructor(private readonly cfg: ResendConfig, private readonly fetchImpl: FetchImpl = fetch) {}

  async sendInvite(input: InviteEmailInput): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.cfg.from,
        to: input.to,
        subject: `${input.inviterName} invited you to ${input.orgName} on SignalOS`,
        html: renderInviteHtml(input),
      }),
    });

    if (!res.ok) {
      // Never log the API key; the response body may echo the request, so we log
      // only status + a bounded snippet of the body, not headers.
      const bodyText = await res.text().catch(() => '');
      throw new EmailSendError(`Resend invite email failed: HTTP ${res.status} ${bodyText.slice(0, 300)}`);
    }
  }
}

function renderInviteHtml(input: InviteEmailInput): string {
  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <p>${safe(input.inviterName)} invited you to join <strong>${safe(input.orgName)}</strong> on SignalOS as <strong>${safe(input.role)}</strong>.</p>
    <p><a href="${input.acceptUrl}">Accept your invite</a></p>
    <p style="color:#666;font-size:12px">This link expires in 90 days and can only be used once. If you didn't expect this invite, you can ignore this email.</p>
  `.trim();
}
