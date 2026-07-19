import { AlertCircle } from 'lucide-react';

import { OrderWorkspace } from '../../components/order-workspace';
import { getOrders } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  try {
    const { orders } = await getOrders();
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Household orders</h1>
            <p className="pageDescription">
              Reconcile multi-camper outcomes, holds, payments, and installment schedules.
            </p>
          </div>
        </header>
        <OrderWorkspace orders={orders} />
      </>
    );
  } catch {
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Household orders</h1>
          </div>
        </header>
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} /> Orders could not be loaded.
        </div>
      </>
    );
  }
}
