/**
 * No email-sending service exists in this codebase yet (see `NEXT.md`). `Mailer` is
 * the seam a real one (SES, Postgres-backed outbox, etc.) drops into later;
 * `LoggingMailer` just logs the "send" so invites are visibly real without lying
 * about delivering an email.
 */
export interface Mailer {
  sendInvite(to: string, orgId: string, inviteId: string, role: string): Promise<void>;
}

export interface MailerLogger {
  info(message: string, meta?: Record<string, unknown>): void;
}

export class LoggingMailer implements Mailer {
  constructor(private readonly logger: MailerLogger = console) {}

  async sendInvite(to: string, orgId: string, inviteId: string, role: string): Promise<void> {
    this.logger.info('[stub] invite email not sent (no email service configured)', { to, orgId, inviteId, role });
  }
}
