'use client';

import type {
  FamilyDetail,
  HouseholdOrder,
  OrderQuote,
  OrderQuoteCreate,
  OnlinePaymentCheckout,
  PricingConfiguration,
  ProblemResponse,
  SessionDetail,
} from '@camp-registration/contracts';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Plus,
  ShoppingCart,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface CartLine {
  addOnIds: string[];
  camperId: string;
  key: string;
  sessionId: string;
}

interface HouseholdCartProps {
  family: FamilyDetail;
  initialCamperId?: string | undefined;
  initialOrders: HouseholdOrder[];
  pricing: PricingConfiguration;
  requestHeaders: Record<string, string>;
  sessions: SessionDetail[];
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isProblem(value: unknown): value is ProblemResponse {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}

function requiredAddOns(pricing: PricingConfiguration, sessionId: string): string[] {
  return pricing.add_ons
    .filter((addOn) => addOn.session_id === sessionId && addOn.active && addOn.required)
    .map((addOn) => addOn.id);
}

function newLine(pricing: PricingConfiguration, camperId: string, sessionId: string): CartLine {
  return {
    addOnIds: requiredAddOns(pricing, sessionId),
    camperId,
    key: crypto.randomUUID(),
    sessionId,
  };
}

async function postJson<T>(
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<T | ProblemResponse> {
  const response = await fetch(path, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  });
  return (await response.json()) as T | ProblemResponse;
}

function outcomeLabel(outcome: HouseholdOrder['lines'][number]['outcome']): string {
  const labels = {
    CANCELLED: 'Cancelled',
    CONFIRMED: 'Confirmed',
    EXPIRED: 'Expired',
    HELD: 'Held for payment',
    WAITLISTED: 'Waitlisted',
  };
  return labels[outcome];
}

export function HouseholdCart({
  family,
  initialCamperId,
  initialOrders,
  pricing,
  requestHeaders,
  sessions,
}: HouseholdCartProps) {
  const activeSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !['CANCELLED', 'ARCHIVED'].includes(session.status) &&
          new Date(session.registration_closes_at).getTime() > Date.now(),
      ),
    [sessions],
  );
  const firstCamperId =
    family.campers.find((camper) => camper.id === initialCamperId)?.id ??
    family.campers[0]?.id ??
    '';
  const firstSessionId = activeSessions[0]?.id ?? '';
  const [lines, setLines] = useState<CartLine[]>(
    firstCamperId && firstSessionId ? [newLine(pricing, firstCamperId, firstSessionId)] : [],
  );
  const [waitlistMode, setWaitlistMode] = useState<'INDIVIDUAL' | 'KEEP_TOGETHER'>('INDIVIDUAL');
  const [couponCode, setCouponCode] = useState('');
  const [planId, setPlanId] = useState('');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [orders, setOrders] = useState(initialOrders);
  const [createdOrder, setCreatedOrder] = useState<HouseholdOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateLine = (key: string, update: Partial<CartLine>) => {
    setQuote(null);
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...update };
        if (update.sessionId) next.addOnIds = requiredAddOns(pricing, update.sessionId);
        return next;
      }),
    );
  };

  const payload = (): OrderQuoteCreate => ({
    coupon_code: couponCode.trim() || null,
    lines: lines.map((line) => ({
      add_on_ids: line.addOnIds,
      camper_id: line.camperId,
      session_id: line.sessionId,
    })),
    payment_plan_template_id: planId || null,
    waitlist_mode: waitlistMode,
  });

  const review = async () => {
    setBusy(true);
    setMessage(null);
    const result = await postJson<OrderQuote>(
      `/api/v1/families/${family.id}/order-quotes`,
      payload(),
      requestHeaders,
    );
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setQuote(result);
    if (!result.valid) setMessage('Review the line-level issues before submitting this order.');
  };

  const startPayment = async (order: HouseholdOrder) => {
    const checkout = await postJson<OnlinePaymentCheckout>(
      `/api/v1/families/${family.id}/orders/${order.id}/online-payment`,
      { idempotency_key: crypto.randomUUID() },
      requestHeaders,
    );
    if (isProblem(checkout)) {
      setMessage(checkout.message);
      setBusy(false);
      return;
    }
    window.location.assign(checkout.checkout_url);
  };

  const submitOrder = async () => {
    if (!quote?.valid) return;
    setBusy(true);
    setMessage(null);
    const result = await postJson<HouseholdOrder>(
      `/api/v1/families/${family.id}/orders`,
      { ...payload(), idempotency_key: crypto.randomUUID() },
      requestHeaders,
    );
    if (isProblem(result)) {
      setMessage(result.message);
      setBusy(false);
      setQuote(null);
      return;
    }
    setCreatedOrder(result);
    setOrders((current) => [result, ...current.filter((order) => order.id !== result.id)]);
    if (result.payment_required) {
      await startPayment(result);
      return;
    }
    setBusy(false);
  };

  const payInstallment = async (order: HouseholdOrder, installmentId: string) => {
    setBusy(true);
    setMessage(null);
    const checkout = await postJson<OnlinePaymentCheckout>(
      `/api/v1/families/${family.id}/installments/${installmentId}/online-payment`,
      { idempotency_key: crypto.randomUUID() },
      requestHeaders,
    );
    if (isProblem(checkout)) {
      setMessage(checkout.message);
      setBusy(false);
      return;
    }
    window.location.assign(checkout.checkout_url);
  };

  if (createdOrder && !createdOrder.payment_required) {
    return (
      <div className="orderConfirmation" role="status">
        <CheckCircle2 size={34} aria-hidden="true" />
        <div>
          <p className="contextLabel">Order received</p>
          <h2>Your campers are in the right place</h2>
          <p>
            {createdOrder.lines.filter((line) => line.outcome === 'CONFIRMED').length} confirmed and{' '}
            {createdOrder.lines.filter((line) => line.outcome === 'WAITLISTED').length} waitlisted.
          </p>
          <div className="orderConfirmationLines">
            {createdOrder.lines.map((line) => (
              <span key={line.id}>
                <strong>{line.camper_name}</strong> · {line.session_name} ·{' '}
                {outcomeLabel(line.outcome)}
              </span>
            ))}
          </div>
          <button className="buttonSecondary" onClick={() => setCreatedOrder(null)} type="button">
            View cart and order history
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="householdCheckout">
      <section className="cartBuilder" aria-labelledby="cart-heading">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Household cart</p>
            <h2 id="cart-heading">Campers and sessions</h2>
            <p className="sectionDescription">
              Add up to 20 camper-session choices. Availability and prices are checked again at
              submission.
            </p>
          </div>
          <span className="cartCount">
            <ShoppingCart size={17} /> {lines.length}/20
          </span>
        </div>

        {lines.length === 0 ? (
          <p className="emptyStateText">No eligible campers or sessions are available.</p>
        ) : (
          <div className="cartLineStack">
            {lines.map((line, index) => {
              const addOns = pricing.add_ons.filter(
                (addOn) => addOn.session_id === line.sessionId && addOn.active,
              );
              return (
                <fieldset className="cartLine" key={line.key}>
                  <legend>Registration {index + 1}</legend>
                  <div className="cartLineFields">
                    <label>
                      <span>Camper</span>
                      <select
                        aria-label={`Camper for registration ${index + 1}`}
                        onChange={(event) => updateLine(line.key, { camperId: event.target.value })}
                        value={line.camperId}
                      >
                        {family.campers.map((camper) => (
                          <option key={camper.id} value={camper.id}>
                            {camper.preferred_name || camper.first_name} {camper.last_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Session</span>
                      <select
                        aria-label={`Session for registration ${index + 1}`}
                        onChange={(event) =>
                          updateLine(line.key, { sessionId: event.target.value })
                        }
                        value={line.sessionId}
                      >
                        {activeSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name} · {formatDate(session.starts_on)} ·{' '}
                            {money(session.price_cents)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      aria-label={`Remove registration ${index + 1}`}
                      className="iconButton dangerButton"
                      disabled={lines.length === 1}
                      onClick={() => {
                        setQuote(null);
                        setLines((current) => current.filter((item) => item.key !== line.key));
                      }}
                      title="Remove registration"
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {addOns.length > 0 && (
                    <div className="cartAddOns" aria-label="Session add-ons">
                      {addOns.map((addOn) => (
                        <label key={addOn.id}>
                          <input
                            checked={line.addOnIds.includes(addOn.id)}
                            disabled={addOn.required}
                            onChange={(event) =>
                              updateLine(line.key, {
                                addOnIds: event.target.checked
                                  ? [...line.addOnIds, addOn.id]
                                  : line.addOnIds.filter((id) => id !== addOn.id),
                              })
                            }
                            type="checkbox"
                          />
                          <span>
                            <strong>
                              {addOn.name}
                              {addOn.required ? ' · Required' : ''}
                            </strong>
                            <small>
                              {addOn.description || 'Session add-on'} · {money(addOn.price_cents)}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        <button
          className="buttonSecondary addCartLine"
          disabled={lines.length >= 20 || !firstCamperId || !firstSessionId}
          onClick={() => {
            setQuote(null);
            setLines((current) => [...current, newLine(pricing, firstCamperId, firstSessionId)]);
          }}
          type="button"
        >
          <Plus size={17} /> Add another camper or session
        </button>

        <fieldset className="outcomeChoice">
          <legend>If a session is full</legend>
          <label className={waitlistMode === 'INDIVIDUAL' ? 'selected' : ''}>
            <input
              checked={waitlistMode === 'INDIVIDUAL'}
              name="waitlist-mode"
              onChange={() => {
                setQuote(null);
                setWaitlistMode('INDIVIDUAL');
              }}
              type="radio"
            />
            <Users size={19} />
            <span>
              <strong>Individual outcomes</strong>
              <small>Register available choices and waitlist only the full ones.</small>
            </span>
          </label>
          <label className={waitlistMode === 'KEEP_TOGETHER' ? 'selected' : ''}>
            <input
              checked={waitlistMode === 'KEEP_TOGETHER'}
              name="waitlist-mode"
              onChange={() => {
                setQuote(null);
                setWaitlistMode('KEEP_TOGETHER');
              }}
              type="radio"
            />
            <Users size={19} />
            <span>
              <strong>Keep campers together</strong>
              <small>Hold every choice or place the complete group on the waitlist.</small>
            </span>
          </label>
        </fieldset>

        <div className="cartOptions">
          <label>
            <span>Coupon code</span>
            <input
              maxLength={64}
              onChange={(event) => {
                setCouponCode(event.target.value);
                setQuote(null);
              }}
              placeholder="Optional"
              value={couponCode}
            />
          </label>
          <label>
            <span>Payment choice</span>
            <select
              onChange={(event) => {
                setPlanId(event.target.value);
                setQuote(null);
              }}
              value={planId}
            >
              <option value="">Pay deposit, balance later</option>
              {pricing.payment_plan_templates
                .filter((plan) => plan.active)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {message && (
          <div className="notice noticeError" role="alert">
            <AlertCircle size={18} />
            {message}
          </div>
        )}

        <div className="cartActions">
          <button
            className="buttonSecondary"
            disabled={busy || lines.length === 0}
            onClick={review}
            type="button"
          >
            {busy ? 'Checking…' : 'Review order'}
          </button>
          <small>Your cart is stored only in this browser until you submit it.</small>
        </div>
      </section>

      <aside className="orderReview" aria-labelledby="review-heading">
        <div className="sectionHeadingWithIcon">
          <span>
            <CreditCard size={19} />
          </span>
          <div>
            <h2 id="review-heading">Order review</h2>
            <p>Server-verified price and availability</p>
          </div>
        </div>
        {!quote ? (
          <div className="reviewPlaceholder">
            <ShoppingCart size={28} />
            <p>Review your cart to see line outcomes and today’s payment.</p>
          </div>
        ) : (
          <>
            <div className="reviewLineStack">
              {quote.lines.map((line, index) => (
                <div className="reviewLine" key={`${line.camper_id}-${line.session_id}-${index}`}>
                  <div>
                    <strong>{line.camper_name}</strong>
                    <span>{line.session_name}</span>
                  </div>
                  <span className={`statusBadge orderOutcome${line.outcome.toLowerCase()}`}>
                    {line.outcome === 'AVAILABLE'
                      ? 'Available'
                      : line.outcome === 'WAITLIST'
                        ? 'Waitlist'
                        : 'Needs attention'}
                  </span>
                  <strong>
                    {line.outcome === 'WAITLIST' ? 'No charge today' : money(line.net_price_cents)}
                  </strong>
                  {line.errors.map((error) => (
                    <small className="formErrorText" key={error}>
                      {error}
                    </small>
                  ))}
                </div>
              ))}
            </div>
            <dl className="orderTotals">
              <div>
                <dt>Camp and add-ons</dt>
                <dd>{money(quote.totals.gross_total_cents)}</dd>
              </div>
              {quote.totals.automatic_discount_cents > 0 && (
                <div>
                  <dt>Automatic discount</dt>
                  <dd>−{money(quote.totals.automatic_discount_cents)}</dd>
                </div>
              )}
              {quote.totals.coupon_discount_cents > 0 && (
                <div>
                  <dt>Coupon</dt>
                  <dd>−{money(quote.totals.coupon_discount_cents)}</dd>
                </div>
              )}
              {quote.totals.assistance_cents > 0 && (
                <div>
                  <dt>Financial assistance</dt>
                  <dd>−{money(quote.totals.assistance_cents)}</dd>
                </div>
              )}
              <div className="orderTotalFinal">
                <dt>Order total</dt>
                <dd>{money(quote.totals.net_total_cents)}</dd>
              </div>
              <div className="orderDueToday">
                <dt>Due today</dt>
                <dd>{money(quote.totals.deposit_due_cents)}</dd>
              </div>
            </dl>
            <button
              className="buttonPrimary"
              disabled={busy || !quote.valid}
              onClick={submitOrder}
              type="button"
            >
              <CreditCard size={17} />{' '}
              {quote.totals.deposit_due_cents > 0
                ? `Continue to payment · ${money(quote.totals.deposit_due_cents)}`
                : 'Submit order'}
            </button>
            <p className="holdDisclosure">
              <Clock3 size={15} /> Available spaces are held for 10 minutes after submission.
            </p>
          </>
        )}
      </aside>

      <section className="orderHistory" aria-labelledby="history-heading">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Account history</p>
            <h2 id="history-heading">Household orders</h2>
          </div>
        </div>
        {orders.length === 0 ? (
          <p className="emptyStateText">Your household has no cart orders yet.</p>
        ) : (
          <div className="orderCardStack">
            {orders.map((order) => (
              <article className="orderCard" key={order.id}>
                <header>
                  <div>
                    <strong>{new Date(order.created_at).toLocaleDateString()}</strong>
                    <small>
                      {order.lines.length} camper-session choice
                      {order.lines.length === 1 ? '' : 's'}
                    </small>
                  </div>
                  <span className={`statusBadge orderStatus${order.status.toLowerCase()}`}>
                    {order.status.replaceAll('_', ' ').toLowerCase()}
                  </span>
                </header>
                <div className="orderHistoryLines">
                  {order.lines.map((line) => (
                    <span key={line.id}>
                      <CalendarDays size={15} />
                      <strong>{line.camper_name}</strong> · {line.session_name}
                      <small>
                        {outcomeLabel(line.outcome)} · {money(line.net_price_cents)}
                      </small>
                    </span>
                  ))}
                </div>
                <div className="orderHistoryTotal">
                  <span>Order total</span>
                  <strong>{money(order.totals.net_total_cents)}</strong>
                </div>
                {order.installments.length > 0 && (
                  <div className="installmentSchedule">
                    <strong>Installment schedule</strong>
                    {order.installments.map((installment) => (
                      <div key={installment.id}>
                        <span>
                          {formatDate(installment.due_on)} · {money(installment.amount_cents)} ·{' '}
                          {installment.status.toLowerCase()}
                        </span>
                        {installment.status !== 'PAID' && (
                          <button
                            className="buttonSecondary"
                            disabled={busy}
                            onClick={() => payInstallment(order, installment.id)}
                            type="button"
                          >
                            Pay now
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
