import type { ProviderPaymentEvent } from '@camp-registration/database';
import Stripe from 'stripe';

import type { HostedCheckoutInput, HostedCheckoutResult, PaymentProvider } from './provider.js';

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

function normalizedStatus(
  eventType: string,
  session: Stripe.Checkout.Session,
): ProviderPaymentEvent['status'] {
  if (eventType === 'checkout.session.async_payment_failed') return 'FAILED';
  if (eventType === 'checkout.session.expired') return 'CANCELLED';
  if (
    eventType === 'checkout.session.async_payment_succeeded' ||
    (eventType === 'checkout.session.completed' && session.payment_status === 'paid')
  ) {
    return 'SUCCEEDED';
  }
  return 'PENDING';
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'STRIPE' as const;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly publicBaseUrl: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult> {
    const metadata = {
      organization_id: input.organizationId,
      payment_attempt_id: input.attemptId,
      registration_id: input.registrationId,
    };
    const session = await this.stripe.checkout.sessions.create(
      {
        cancel_url: new URL('/portal?payment=cancelled', this.publicBaseUrl).toString(),
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              product_data: {
                name: `Deposit - ${input.sessionName}`,
                description: `${input.camperName} camp registration deposit`,
              },
              unit_amount: input.amountCents,
            },
            quantity: 1,
          },
        ],
        metadata,
        mode: 'payment',
        payment_intent_data: { metadata },
        success_url: `${this.publicBaseUrl.replace(/\/$/, '')}/portal?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      },
      {
        idempotencyKey: `payment-attempt:${input.attemptId}`,
        stripeAccount: input.providerAccountId,
      },
    );
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    return { checkoutUrl: session.url, providerCheckoutSessionId: session.id };
  }

  verifyWebhook(rawBody: Buffer, signature: string): ProviderPaymentEvent | null {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    if (
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
      ].includes(event.type)
    ) {
      return null;
    }
    const session = event.data.object as Stripe.Checkout.Session;
    const attemptId = session.metadata?.payment_attempt_id;
    const organizationId = session.metadata?.organization_id;
    const providerAccountId = event.account;
    if (!attemptId || !organizationId || !providerAccountId || session.amount_total === null) {
      throw new Error('Stripe Checkout event is missing required payment metadata');
    }
    if (session.currency?.toUpperCase() !== 'USD') {
      throw new Error('Stripe Checkout event currency does not match the registration ledger');
    }
    return {
      amount_cents: session.amount_total,
      attempt_id: attemptId,
      currency: 'USD',
      event_id: event.id,
      event_type: event.type,
      failure_code:
        event.type === 'checkout.session.async_payment_failed' ? 'async_payment_failed' : null,
      organization_id: organizationId,
      provider: 'STRIPE',
      provider_account_id: providerAccountId,
      provider_checkout_session_id: session.id,
      provider_payment_intent_id: paymentIntentId(session),
      receipt_url: null,
      status: normalizedStatus(event.type, session),
    };
  }
}
