import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { StripePaymentProvider } from '../src/payments/stripe-provider.js';

const webhookSecret = 'whsec_test_payment_signature';

function signedCheckoutEvent() {
  const payload = JSON.stringify({
    account: 'acct_testcamp',
    data: {
      object: {
        amount_total: 2500,
        currency: 'usd',
        id: 'cs_test_deposit',
        metadata: {
          organization_id: 'a60b272f-b028-4f1a-b666-3ef3cffd9827',
          payment_attempt_id: 'd123e456-e89b-42d3-a456-426614174000',
          registration_id: 'c123e456-e89b-42d3-a456-426614174000',
        },
        object: 'checkout.session',
        payment_intent: 'pi_test_deposit',
        payment_status: 'paid',
      },
    },
    id: 'evt_test_deposit',
    object: 'event',
    type: 'checkout.session.completed',
  });
  const stripe = new Stripe('sk_test_signature_fixture');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  return { payload: Buffer.from(payload), signature };
}

function signedRefundEvent() {
  const payload = JSON.stringify({
    account: 'acct_testcamp',
    data: {
      object: {
        amount: 1000,
        currency: 'usd',
        failure_reason: null,
        id: 're_test_adjustment',
        metadata: {
          organization_id: 'a60b272f-b028-4f1a-b666-3ef3cffd9827',
          payment_adjustment_id: 'e123e456-e89b-42d3-a456-426614174000',
        },
        object: 'refund',
        payment_intent: 'pi_test_deposit',
        status: 'succeeded',
      },
    },
    id: 'evt_test_refund',
    object: 'event',
    type: 'refund.updated',
  });
  const stripe = new Stripe('sk_test_signature_fixture');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  return { payload: Buffer.from(payload), signature };
}

describe('Stripe payment provider webhooks', () => {
  it('verifies and normalizes a signed Checkout completion', () => {
    const provider = new StripePaymentProvider(
      'sk_test_signature_fixture',
      webhookSecret,
      'http://localhost:3000',
    );
    const { payload, signature } = signedCheckoutEvent();

    expect(provider.verifyWebhook(payload, signature)).toMatchObject({
      amount_cents: 2500,
      event_id: 'evt_test_deposit',
      provider: 'STRIPE',
      provider_account_id: 'acct_testcamp',
      provider_checkout_session_id: 'cs_test_deposit',
      provider_payment_intent_id: 'pi_test_deposit',
      status: 'SUCCEEDED',
    });
  });

  it('rejects a webhook whose signature does not match the raw body', () => {
    const provider = new StripePaymentProvider(
      'sk_test_signature_fixture',
      webhookSecret,
      'http://localhost:3000',
    );
    const { payload } = signedCheckoutEvent();

    expect(() => provider.verifyWebhook(payload, 't=1,v1=invalid')).toThrow();
  });

  it('verifies and normalizes a connected-account refund update', () => {
    const provider = new StripePaymentProvider(
      'sk_test_signature_fixture',
      webhookSecret,
      'http://localhost:3000',
    );
    const { payload, signature } = signedRefundEvent();

    expect(provider.verifyWebhook(payload, signature)).toMatchObject({
      adjustment_id: 'e123e456-e89b-42d3-a456-426614174000',
      amount_cents: 1000,
      event_id: 'evt_test_refund',
      kind: 'REFUND',
      provider: 'STRIPE',
      provider_account_id: 'acct_testcamp',
      provider_refund_id: 're_test_adjustment',
      status: 'SUCCEEDED',
    });
  });
});
