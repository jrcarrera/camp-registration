import { randomUUID } from 'node:crypto';

import { createDatabaseClient, PaymentStore } from '@camp-registration/database';

import { LocalPaymentProvider, type PaymentProvider } from './payments/provider.js';
import { StripePaymentProvider } from './payments/stripe-provider.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function provider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? 'local').toLowerCase();
  const baseUrl = process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000';
  if (name === 'local') return new LocalPaymentProvider(baseUrl);
  if (name === 'stripe') {
    return new StripePaymentProvider(
      required('STRIPE_SECRET_KEY'),
      required('STRIPE_WEBHOOK_SECRET'),
      baseUrl,
    );
  }
  throw new Error('Billing worker requires PAYMENT_PROVIDER=local or stripe');
}

const database = createDatabaseClient({ connectionString: required('DATABASE_URL') });
const store = new PaymentStore(database);
const paymentProvider = provider();
const intervalMs = Number.parseInt(process.env.BILLING_WORKER_INTERVAL_MS ?? '30000', 10);
let stopping = false;

async function cycle(): Promise<void> {
  const cycleId = randomUUID();
  for (const organizationId of await store.listOrganizations()) {
    for (const attempt of await store.listExpiringOrderPayments(organizationId)) {
      try {
        if (!paymentProvider.expireHostedCheckout) continue;
        await paymentProvider.expireHostedCheckout(
          attempt.provider_account_id,
          attempt.provider_checkout_session_id,
        );
        await store.expireOrderPayment(organizationId, attempt.attempt_id);
      } catch (error) {
        process.stderr.write(
          `${JSON.stringify({ cycle_id: cycleId, error: String(error), level: 'error', organization_id: organizationId, payment_attempt_id: attempt.attempt_id })}\n`,
        );
      }
    }
    const reminders = await store.advanceInstallmentNotifications(organizationId);
    process.stdout.write(
      `${JSON.stringify({ cycle_id: cycleId, installment_reminders: reminders, level: 'info', organization_id: organizationId })}\n`,
    );
  }
}

async function run(): Promise<void> {
  while (!stopping) {
    try {
      await cycle();
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ error: String(error), level: 'error' })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function shutdown(): Promise<void> {
  stopping = true;
  await database.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
await run();
