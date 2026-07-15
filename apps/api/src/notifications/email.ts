import { createHash } from 'node:crypto';

import type { NotificationOutboxRecord } from '@camp-registration/database';
import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  messageId: string;
  subject: string;
  text: string;
  to: string;
}

export interface EmailSender {
  close?(): void;
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpEmailSenderOptions {
  from: string;
  host: string;
  password?: string;
  port: number;
  secure: boolean;
  username?: string;
}

export class SmtpEmailSender implements EmailSender {
  private readonly from: string;
  private readonly transporter: Transporter;

  constructor(options: SmtpEmailSenderOptions) {
    this.from = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(options.username
        ? { auth: { pass: options.password ?? '', user: options.username } }
        : {}),
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      messageId: message.messageId,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
  }

  close(): void {
    this.transporter.close();
  }
}

function claimDeadline(value: string, timeZone: string): string {
  const deadline = new Date(value);
  if (Number.isNaN(deadline.valueOf())) return value;
  return deadline.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
  });
}

function deterministicMessageId(idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex');
  return `<${digest}@notifications.camp-registration.local>`;
}

export function buildWaitlistEmail(
  record: NotificationOutboxRecord,
  portalBaseUrl: string,
): EmailMessage {
  const data = record.template_data;
  const portalUrl = new URL(data.portal_path, portalBaseUrl).toString();
  const deadline = claimDeadline(data.expires_at, data.organization_timezone);
  const greeting = `${data.family_name},`;
  const signature = `\n\nReview your camp plan: ${portalUrl}\n\nCamp Registration`;

  const content: Record<
    NotificationOutboxRecord['notification_type'],
    { subject: string; text: string }
  > = {
    WAITLIST_ACCEPTED: {
      subject: `Confirmed: ${data.session_name}`,
      text: `${greeting}\n\n${data.camper_name} is confirmed for ${data.session_name}.${signature}`,
    },
    WAITLIST_CANCELLED: {
      subject: `Waitlist offer cancelled: ${data.session_name}`,
      text: `${greeting}\n\nThe active waitlist offer for ${data.camper_name} in ${data.session_name} was cancelled. Review the parent portal for the current waitlist status.${signature}`,
    },
    WAITLIST_DECLINED: {
      subject: `Waitlist offer declined: ${data.session_name}`,
      text: `${greeting}\n\nThe waitlist offer for ${data.camper_name} in ${data.session_name} was declined and the waitlist registration was released.${signature}`,
    },
    WAITLIST_EXPIRED: {
      subject: `Waitlist offer expired: ${data.session_name}`,
      text: `${greeting}\n\nThe waitlist offer for ${data.camper_name} in ${data.session_name} expired at ${deadline}. The waitlist registration was released.${signature}`,
    },
    WAITLIST_EXPIRING_SOON: {
      subject: `Reminder: ${data.session_name} offer expires soon`,
      text: `${greeting}\n\nThe waitlist seat for ${data.camper_name} in ${data.session_name} is available until ${deadline}. Accept or decline it in the parent portal before the deadline.${signature}`,
    },
    WAITLIST_OFFERED: {
      subject: `A seat is available: ${data.session_name}`,
      text: `${greeting}\n\nA seat is available for ${data.camper_name} in ${data.session_name}. Accept or decline it in the parent portal by ${deadline}.${signature}`,
    },
  };
  const selected = content[record.notification_type];
  return {
    messageId: deterministicMessageId(record.idempotency_key),
    subject: selected.subject,
    text: selected.text,
    to: record.recipient_email,
  };
}
