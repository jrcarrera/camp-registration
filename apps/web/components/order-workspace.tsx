'use client';

import type { HouseholdOrder } from '@camp-registration/contracts';
import { AlertTriangle, Search, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

export function OrderWorkspace({ orders }: { orders: HouseholdOrder[] }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(orders[0]?.id ?? null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orders;
    return orders.filter((order) =>
      [
        order.id,
        order.family_name,
        ...order.lines.flatMap((line) => [line.camper_name, line.session_name]),
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [orders, query]);
  const selected = orders.find((order) => order.id === selectedId) ?? filtered[0] ?? null;
  const stuck = orders.filter((order) =>
    order.lines.some(
      (line) =>
        line.outcome === 'HELD' &&
        line.hold_expires_at &&
        new Date(line.hold_expires_at) < new Date(),
    ),
  );

  return (
    <div className="financeWorkspace">
      {stuck.length > 0 && (
        <div className="notice noticeError" role="alert">
          <AlertTriangle size={18} />
          {stuck.length} order{stuck.length === 1 ? '' : 's'} have holds past their 10-minute
          deadline and need worker reconciliation.
        </div>
      )}
      <section className="contentSection" aria-labelledby="orders-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="orders-heading">Household orders</h2>
            <p className="sectionDescription">
              Search by family, camper, session, or order reference.
            </p>
          </div>
          <label className="checkInSearch">
            <Search size={17} />
            <input
              aria-label="Search household orders"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              value={query}
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="emptyStateText">No household orders match this search.</p>
        ) : (
          <div className="orderAdminLayout">
            <div className="orderAdminList">
              {filtered.map((order) => (
                <button
                  className={selected?.id === order.id ? 'selected' : ''}
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  type="button"
                >
                  <ShoppingCart size={17} />
                  <span>
                    <strong>{order.family_name}</strong>
                    <small>
                      {new Date(order.created_at).toLocaleString()} · {order.lines.length} lines
                    </small>
                  </span>
                  <span className="statusBadge">
                    {order.status.replaceAll('_', ' ').toLowerCase()}
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <article className="orderAdminDetail">
                <header>
                  <div>
                    <p className="contextLabel">Order {selected.id.slice(0, 8)}</p>
                    <h3>{selected.family_name}</h3>
                  </div>
                  <strong>{money(selected.totals.net_total_cents)}</strong>
                </header>
                <dl className="orderTotals">
                  <div>
                    <dt>Gross price</dt>
                    <dd>{money(selected.totals.gross_total_cents)}</dd>
                  </div>
                  <div>
                    <dt>Automatic discount</dt>
                    <dd>−{money(selected.totals.automatic_discount_cents)}</dd>
                  </div>
                  <div>
                    <dt>Coupon</dt>
                    <dd>−{money(selected.totals.coupon_discount_cents)}</dd>
                  </div>
                  <div>
                    <dt>Assistance</dt>
                    <dd>−{money(selected.totals.assistance_cents)}</dd>
                  </div>
                  <div className="orderDueToday">
                    <dt>Deposit due</dt>
                    <dd>{money(selected.totals.deposit_due_cents)}</dd>
                  </div>
                </dl>
                <div className="orderHistoryLines">
                  {selected.lines.map((line) => (
                    <span key={line.id}>
                      <ShoppingCart size={15} />
                      <strong>{line.camper_name}</strong> · {line.session_name}
                      <small>
                        {line.outcome.toLowerCase()} · {money(line.net_price_cents)}
                        {line.hold_expires_at
                          ? ` · hold until ${new Date(line.hold_expires_at).toLocaleTimeString()}`
                          : ''}
                      </small>
                    </span>
                  ))}
                </div>
                {selected.installments.length > 0 && (
                  <div className="installmentSchedule">
                    <strong>Installments</strong>
                    {selected.installments.map((item) => (
                      <div key={item.id}>
                        <span>
                          {item.due_on} · {money(item.amount_cents)}
                        </span>
                        <span className="statusBadge">{item.status.toLowerCase()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
