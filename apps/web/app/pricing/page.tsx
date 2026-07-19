import { AlertCircle } from 'lucide-react';

import { PricingWorkspace } from '../../components/pricing-workspace';
import { getCatalog, getPricing, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  try {
    const [catalog, pricing, sessions] = await Promise.all([
      getCatalog(),
      getPricing(),
      getSessions(),
    ]);
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Pricing policies</h1>
            <p className="pageDescription">
              Manage add-ons, automatic discounts, coupons, and parent payment plans.
            </p>
          </div>
        </header>
        <PricingWorkspace catalog={catalog} initial={pricing} sessions={sessions.sessions} />
      </>
    );
  } catch {
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Pricing policies</h1>
          </div>
        </header>
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} /> Pricing configuration could not be loaded.
        </div>
      </>
    );
  }
}
