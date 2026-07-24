import { AlertCircle } from 'lucide-react';

import { PaymentAdjustmentsWorkspace } from '../../components/payment-adjustments-workspace';
import { getPaymentAdjustmentCenter, getPaymentAttempts } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  try {
    const [attempts, center] = await Promise.all([
      getPaymentAttempts(),
      getPaymentAdjustmentCenter(),
    ]);
    return (
      <PaymentAdjustmentsWorkspace initialAttempts={attempts.attempts} initialCenter={center} />
    );
  } catch {
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Finance operations</p>
            <h1>Payments and adjustments</h1>
          </div>
        </header>
        <div className="notice noticeError" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          Finance accounts could not be loaded. Confirm that your role includes finance access.
        </div>
      </>
    );
  }
}
