import { createHash } from 'node:crypto';

import type {
  NotificationOutboxRecord,
  BillingNotificationTemplateData,
  IdentityNotificationTemplateData,
  LifecycleNotificationTemplateData,
  OrderNotificationSummary,
  PaymentReceiptNotificationTemplateData,
  WaitlistNotificationTemplateData,
  WaitlistNotificationType,
} from '@camp-registration/database';
import nodemailer, { type Transporter } from 'nodemailer';

import type { AuthStateCipher } from '../identity/encryption.js';

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

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function orderSummaryText(summary: OrderNotificationSummary): string {
  const lines = summary.lines.map((line) => {
    const adjustments =
      line.automatic_discount_cents + line.coupon_discount_cents + line.assistance_cents;
    return `- ${line.camper_name} — ${line.session_name} (${line.outcome.toLowerCase()}): gross ${money(line.gross_price_cents)}, adjustments -${money(adjustments)}, net ${money(line.net_price_cents)}`;
  });
  const installments = summary.installments.length
    ? [
        '\nInstallment schedule:',
        ...summary.installments.map(
          (installment) =>
            `- ${installment.due_on}: ${money(installment.amount_cents)} (${installment.status.toLowerCase()})`,
        ),
      ]
    : [];
  return [
    '\nOrder details:',
    ...lines,
    `\nGross total: ${money(summary.gross_total_cents)}`,
    `Automatic discount: -${money(summary.automatic_discount_cents)}`,
    `Coupon discount: -${money(summary.coupon_discount_cents)}`,
    `Financial assistance: -${money(summary.assistance_cents)}`,
    `Net total: ${money(summary.net_total_cents)}`,
    `Amount paid: ${money(summary.paid_cents)}`,
    `Remaining balance: ${money(summary.remaining_balance_cents)}`,
    ...installments,
  ].join('\n');
}

export function buildWaitlistEmail(
  record: NotificationOutboxRecord,
  portalBaseUrl: string,
  identityCipher?: AuthStateCipher,
): EmailMessage {
  if (record.notification_type === 'IDENTITY_MESSAGE') {
    const data = record.template_data as IdentityNotificationTemplateData;
    if (!identityCipher) throw new Error('Identity notification encryption is not configured');
    const payload = JSON.parse(identityCipher.decrypt(data.encrypted_payload)) as {
      body: string;
      subject: string;
    };
    return {
      messageId: deterministicMessageId(record.idempotency_key),
      subject: payload.subject,
      text: payload.body,
      to: record.recipient_email,
    };
  }
  if (record.notification_type === 'LIFECYCLE_MESSAGE') {
    const data = record.template_data as LifecycleNotificationTemplateData;
    const portalUrl = new URL(data.portal_path, portalBaseUrl).toString();
    return {
      messageId: deterministicMessageId(record.idempotency_key),
      subject: data.subject.replaceAll('{{portal_url}}', portalUrl),
      text: data.body.replaceAll('{{portal_url}}', portalUrl),
      to: record.recipient_email,
    };
  }

  if (record.notification_type === 'PAYMENT_RECEIPT') {
    const data = record.template_data as PaymentReceiptNotificationTemplateData;
    const amount = new Intl.NumberFormat('en-US', {
      currency: data.currency,
      style: 'currency',
    }).format(data.amount_cents / 100);
    const receiptLine = data.receipt_url
      ? `\nProvider receipt: ${data.receipt_url}`
      : data.provider_reference
        ? `\nPayment reference: ${data.provider_reference}`
        : '';
    const summary = data.order_summary ? orderSummaryText(data.order_summary) : '';
    return {
      messageId: deterministicMessageId(record.idempotency_key),
      subject: `Payment received: ${data.session_name}`,
      text: `${data.family_name},\n\nWe received ${amount} for ${data.camper_name}'s registration in ${data.session_name}.${receiptLine}${summary}\n\nReview your camp plan: ${new URL(data.portal_path, portalBaseUrl).toString()}\n\nCamp Registration`,
      to: record.recipient_email,
    };
  }

  if (
    record.notification_type === 'ORDER_CONFIRMATION' ||
    record.notification_type === 'INSTALLMENT_DUE_SOON' ||
    record.notification_type === 'INSTALLMENT_DUE'
  ) {
    const data = record.template_data as BillingNotificationTemplateData;
    const amount = new Intl.NumberFormat('en-US', {
      currency: data.currency,
      style: 'currency',
    }).format(data.amount_cents / 100);
    const portalUrl = new URL(data.portal_path, portalBaseUrl).toString();
    if (record.notification_type === 'ORDER_CONFIRMATION') {
      const summary = data.order_summary ? orderSummaryText(data.order_summary) : '';
      return {
        messageId: deterministicMessageId(record.idempotency_key),
        subject: 'Household camp order confirmed',
        text: `${data.family_name},\n\nYour household order with ${data.line_count ?? 1} registration line(s) is confirmed. Amount paid today: ${amount}.${summary}\n\nReview the order and remaining balance: ${portalUrl}\n\nCamp Registration`,
        to: record.recipient_email,
      };
    }
    const dueText = data.due_on ? claimDeadline(`${data.due_on}T12:00:00Z`, 'UTC') : 'soon';
    return {
      messageId: deterministicMessageId(record.idempotency_key),
      subject:
        record.notification_type === 'INSTALLMENT_DUE'
          ? 'Camp payment installment due'
          : 'Upcoming camp payment installment',
      text: `${data.family_name},\n\nA camp payment installment of ${amount} is ${record.notification_type === 'INSTALLMENT_DUE' ? 'due today' : `due ${dueText}`}. Pay securely from the parent portal: ${portalUrl}\n\nCamp Registration`,
      to: record.recipient_email,
    };
  }

  const data = record.template_data as WaitlistNotificationTemplateData;
  const portalUrl = new URL(data.portal_path, portalBaseUrl).toString();
  const deadline = claimDeadline(data.expires_at, data.organization_timezone);
  const greeting = `${data.family_name},`;
  const signature = `\n\nReview your camp plan: ${portalUrl}\n\nCamp Registration`;

  const content: Record<WaitlistNotificationType, { subject: string; text: string }> = {
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
