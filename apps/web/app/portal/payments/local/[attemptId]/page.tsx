import type { PaymentAttempt } from '@camp-registration/contracts';
import { notFound } from 'next/navigation';

import { LocalPaymentCheckout } from '../../../../../components/local-payment-checkout';
import { getParentApiHeaders } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function LocalPaymentPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const requestHeaders = getParentApiHeaders();
  const response = await fetch(
    `${process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001'}/v1/payments/${encodeURIComponent(attemptId)}`,
    { cache: 'no-store', headers: requestHeaders },
  );
  if (!response.ok) notFound();
  const attempt = (await response.json()) as PaymentAttempt;

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Secure checkout</p>
          <h1>Pay camp deposit</h1>
          <p className="pageDescription">
            Review this server-calculated deposit before completing payment.
          </p>
        </div>
      </header>
      <LocalPaymentCheckout attempt={attempt} requestHeaders={requestHeaders} />
    </>
  );
}
