'use client';

import type {
  PaymentAttempt,
  PaymentCompletion,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, CreditCard, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

export function LocalPaymentCheckout({
  attempt,
  requestHeaders,
}: {
  attempt: PaymentAttempt;
  requestHeaders: Record<string, string>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/payments/local/${attempt.id}/complete`, {
        headers: requestHeaders,
        method: 'POST',
      });
      const result = (await response.json()) as PaymentCompletion | ProblemResponse;
      if (!response.ok || 'code' in result) {
        throw new Error(
          'message' in result ? result.message : 'The payment could not be completed.',
        );
      }
      router.push('/portal?payment=success');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The payment could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <section className="contentSection localCheckoutCard" aria-labelledby="local-checkout-heading">
      <div className="localCheckoutSecurity">
        <LockKeyhole aria-hidden="true" size={18} />
        Local development checkout
      </div>
      <div className="localCheckoutSummary">
        <span className="localCheckoutIcon" aria-hidden="true">
          <CreditCard size={22} />
        </span>
        <div>
          <h2 id="local-checkout-heading">Camp deposit</h2>
          <p>
            {attempt.camper_name} · {attempt.session_name}
          </p>
        </div>
        <strong>{money(attempt.amount_cents)}</strong>
      </div>
      <div className="notice" role="note">
        <CheckCircle2 aria-hidden="true" size={18} />
        This local adapter never asks for card details. Production redirects to Stripe-hosted
        Checkout.
      </div>
      {error ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          {error}
        </div>
      ) : null}
      <button
        className="buttonPrimary localCheckoutButton"
        disabled={submitting}
        onClick={() => void complete()}
        type="button"
      >
        <LockKeyhole aria-hidden="true" size={17} />
        {submitting ? 'Completing…' : `Complete test payment of ${money(attempt.amount_cents)}`}
      </button>
    </section>
  );
}
