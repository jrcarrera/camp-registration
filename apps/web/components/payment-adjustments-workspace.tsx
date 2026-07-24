'use client';

import type {
  PaymentAccount,
  PaymentAdjustmentCenter,
  PaymentAdjustmentType,
  PaymentAttempt,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  RefreshCcw,
  Scale,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function timestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function referenceLabel(value: string): string {
  return value.length > 24 ? `${value.slice(0, 15)}…${value.slice(-6)}` : value;
}

export function PaymentAdjustmentsWorkspace({
  initialAttempts,
  initialCenter,
}: {
  initialAttempts: PaymentAttempt[];
  initialCenter: PaymentAdjustmentCenter;
}) {
  const [center, setCenter] = useState(initialCenter);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountId, setAccountId] = useState(initialCenter.accounts[0]?.registration_id ?? '');
  const [adjustmentType, setAdjustmentType] = useState<PaymentAdjustmentType>('CREDIT');
  const [amount, setAmount] = useState('');
  const [paymentAttemptId, setPaymentAttemptId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [saving, setSaving] = useState(false);

  const account = useMemo(
    () => center.accounts.find((candidate) => candidate.registration_id === accountId),
    [accountId, center.accounts],
  );
  const matchingAccounts = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    if (!query) return center.accounts.slice(0, 50);
    return center.accounts
      .filter((candidate) =>
        [candidate.family_name, candidate.camper_name, candidate.session_name].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
      .slice(0, 100);
  }, [accountQuery, center.accounts]);
  const succeeded = initialAttempts.filter((attempt) => attempt.status === 'SUCCEEDED');
  const pending = initialAttempts.filter((attempt) => attempt.status === 'PENDING').length;
  const needsAttention = initialAttempts.filter(
    (attempt) => attempt.status === 'FAILED' || attempt.status === 'CANCELLED',
  ).length;
  const grossReceived = succeeded.reduce((total, attempt) => total + attempt.amount_cents, 0);
  const refunded = center.adjustments
    .filter(
      (adjustment) => adjustment.adjustment_type === 'REFUND' && adjustment.status === 'SUCCEEDED',
    )
    .reduce((total, adjustment) => total + adjustment.amount_cents, 0);

  function chooseAccount(registrationId: string) {
    setAccountId(registrationId);
    setPaymentAttemptId('');
  }

  function searchAccounts(value: string) {
    setAccountQuery(value);
    const query = value.trim().toLowerCase();
    const matches = center.accounts.filter(
      (candidate) =>
        !query ||
        [candidate.family_name, candidate.camper_name, candidate.session_name].some((field) =>
          field.toLowerCase().includes(query),
        ),
    );
    if (!matches.some((candidate) => candidate.registration_id === accountId)) {
      chooseAccount(matches[0]?.registration_id ?? '');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!account) return;
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setMessage({ text: 'Enter an amount greater than zero.', tone: 'error' });
      return;
    }
    if (adjustmentType === 'REFUND' && !paymentAttemptId) {
      setMessage({ text: 'Choose the settled payment to refund.', tone: 'error' });
      return;
    }
    setSaving(true);
    const response = await fetch('/api/v1/payment-adjustments', {
      body: JSON.stringify({
        adjustment_type: adjustmentType,
        amount_cents: amountCents,
        idempotency_key: crypto.randomUUID(),
        ...(adjustmentType === 'REFUND' ? { payment_attempt_id: paymentAttemptId } : {}),
        reason,
        registration_id: account.registration_id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
      setMessage({
        text: problem?.message ?? 'The payment adjustment could not be recorded.',
        tone: 'error',
      });
      setSaving(false);
      return;
    }
    const refreshed = await fetch('/api/v1/payment-adjustments');
    if (refreshed.ok) setCenter((await refreshed.json()) as PaymentAdjustmentCenter);
    setAmount('');
    setPaymentAttemptId('');
    setReason('');
    setSaving(false);
    setMessage({
      text:
        adjustmentType === 'REFUND'
          ? 'The refund was submitted and added to the audit history.'
          : 'The balance adjustment was recorded.',
      tone: 'success',
    });
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Finance operations</p>
          <h1>Payments and adjustments</h1>
          <p className="pageDescription">
            Reconcile provider payments, issue refunds, and record reviewed balance changes.
          </p>
        </div>
      </header>

      <div className="portalSummaryGrid" aria-label="Payment summary">
        <div className="portalSummaryTile">
          <span>
            <CircleDollarSign aria-hidden="true" size={18} />
          </span>
          <div>
            <strong>{money(grossReceived - refunded)}</strong>
            <small>Net online receipts</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <RefreshCcw aria-hidden="true" size={18} />
          </span>
          <div>
            <strong>{money(refunded)}</strong>
            <small>Refunded</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <CheckCircle2 aria-hidden="true" size={18} />
          </span>
          <div>
            <strong>{succeeded.length}</strong>
            <small>Settled payments</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <AlertCircle aria-hidden="true" size={18} />
          </span>
          <div>
            <strong>{pending + needsAttention}</strong>
            <small>Open or failed attempts</small>
          </div>
        </div>
      </div>

      <section className="contentSection" aria-labelledby="adjustment-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="adjustment-heading">Record an adjustment</h2>
            <p className="sectionDescription">
              Finance staff and administrators only. Every change requires a reason and is audited.
            </p>
          </div>
        </div>
        {center.accounts.length === 0 ? (
          <p className="emptyStateText">No registration payment accounts are available.</p>
        ) : (
          <form className="paymentAdjustmentForm" onSubmit={(event) => void submit(event)}>
            <label>
              Search accounts
              <input
                onChange={(event) => searchAccounts(event.target.value)}
                placeholder="Family, camper, or session"
                type="search"
                value={accountQuery}
              />
            </label>
            <label>
              Registration account
              <select value={accountId} onChange={(event) => chooseAccount(event.target.value)}>
                {matchingAccounts.map((item) => (
                  <option key={item.registration_id} value={item.registration_id}>
                    {item.family_name} · {item.camper_name} · {item.session_name}
                  </option>
                ))}
              </select>
              <small>
                {matchingAccounts.length === 0
                  ? 'No matching accounts.'
                  : `${matchingAccounts.length} account${matchingAccounts.length === 1 ? '' : 's'} shown`}
              </small>
            </label>
            <label>
              Adjustment
              <select
                value={adjustmentType}
                onChange={(event) => {
                  setAdjustmentType(event.target.value as PaymentAdjustmentType);
                  setPaymentAttemptId('');
                }}
              >
                <option value="CREDIT">Credit — reduce balance due</option>
                <option value="CHARGE">Charge — increase balance due</option>
                <option value="REFUND">Refund — return settled card funds</option>
              </select>
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                min="0.01"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            {adjustmentType === 'REFUND' ? (
              <label>
                Settled payment
                <select
                  onChange={(event) => setPaymentAttemptId(event.target.value)}
                  required
                  value={paymentAttemptId}
                >
                  <option value="">Choose a payment</option>
                  {account?.refund_sources.map((source) => (
                    <option key={source.attempt_id} value={source.attempt_id}>
                      {source.provider === 'STRIPE' ? 'Stripe' : 'Local test'} ·{' '}
                      {money(source.refundable_cents)} refundable · {timestamp(source.completed_at)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="paymentAdjustmentReason">
              Reason
              <textarea
                maxLength={500}
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the reviewed reason for this change."
                required
                rows={3}
                value={reason}
              />
            </label>
            {account ? (
              <div className="paymentAccountSnapshot" aria-live="polite">
                <Scale aria-hidden="true" size={18} />
                <span>
                  Current balance <strong>{money(account.balance_due_cents)}</strong>
                </span>
                <span>
                  Refundable <strong>{money(account.refundable_cents)}</strong>
                </span>
              </div>
            ) : null}
            <button className="buttonPrimary" disabled={saving} type="submit">
              {saving
                ? 'Recording…'
                : adjustmentType === 'REFUND'
                  ? 'Issue refund'
                  : 'Record adjustment'}
            </button>
          </form>
        )}
        {message ? (
          <div
            className={`notice ${message.tone === 'error' ? 'noticeError' : 'noticeSuccess'}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.tone === 'error' ? (
              <AlertCircle aria-hidden="true" size={18} />
            ) : (
              <CheckCircle2 aria-hidden="true" size={18} />
            )}
            {message.text}
          </div>
        ) : null}
      </section>

      <section className="contentSection" aria-labelledby="accounts-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="accounts-heading">Registration balances</h2>
            <p className="sectionDescription">
              Applied payments, credits, charges, and provider-refundable funds.
            </p>
          </div>
        </div>
        <div className="tableFrame paymentsTableFrame">
          <table className="paymentsTable">
            <thead>
              <tr>
                <th>Family and camper</th>
                <th>Session</th>
                <th>Price</th>
                <th>Applied</th>
                <th>Credits / charges</th>
                <th>Refunded</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {matchingAccounts.map((item: PaymentAccount) => (
                <tr key={item.registration_id}>
                  <td>
                    <strong>{item.camper_name}</strong>
                    <br />
                    <span className="tableSecondary">{item.family_name}</span>
                  </td>
                  <td>{item.session_name}</td>
                  <td>{money(item.price_cents)}</td>
                  <td>{money(item.paid_cents)}</td>
                  <td>
                    {money(item.credit_cents)} / {money(item.charge_cents)}
                  </td>
                  <td>{money(item.refunded_cents)}</td>
                  <td>
                    <strong>{money(item.balance_due_cents)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matchingAccounts.length === 0 ? (
          <p className="emptyStateText">No registration accounts match that search.</p>
        ) : null}
      </section>

      <section className="contentSection" aria-labelledby="history-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="history-heading">Adjustment history</h2>
            <p className="sectionDescription">
              Immutable reasons, actors, provider references, and settlement status.
            </p>
          </div>
        </div>
        {center.adjustments.length === 0 ? (
          <p className="emptyStateText">No refunds, credits, or charges have been recorded.</p>
        ) : (
          <div className="tableFrame paymentsTableFrame">
            <table className="paymentsTable">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {center.adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td>{timestamp(adjustment.created_at)}</td>
                    <td>{statusLabel(adjustment.adjustment_type)}</td>
                    <td>{money(adjustment.amount_cents)}</td>
                    <td>
                      {adjustment.reason}
                      <br />
                      <span className="tableSecondary">by {adjustment.created_by}</span>
                    </td>
                    <td>
                      <span
                        className={`statusBadge paymentStatus${adjustment.status.toLowerCase()}`}
                      >
                        {statusLabel(adjustment.status)}
                      </span>
                    </td>
                    <td>
                      {adjustment.provider_reference ? (
                        <span title={adjustment.provider_reference}>
                          {referenceLabel(adjustment.provider_reference)}
                        </span>
                      ) : (
                        'Internal'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="contentSection" aria-labelledby="attempts-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="attempts-heading">Checkout reconciliation</h2>
            <p className="sectionDescription">
              Provider state, household scope, and receipt reference.
            </p>
          </div>
        </div>
        {initialAttempts.length === 0 ? (
          <p className="emptyStateText">No online payment attempts yet.</p>
        ) : (
          <div className="tableFrame paymentsTableFrame">
            <table className="paymentsTable">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Camper and session</th>
                  <th>Family</th>
                  <th>Amount</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {initialAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{timestamp(attempt.created_at)}</td>
                    <td>
                      <strong>{attempt.camper_name}</strong>
                      <br />
                      <span className="tableSecondary">{attempt.session_name}</span>
                    </td>
                    <td>{attempt.family_name}</td>
                    <td>{money(attempt.amount_cents)}</td>
                    <td>{attempt.provider === 'STRIPE' ? 'Stripe' : 'Local test'}</td>
                    <td>
                      <span className={`statusBadge paymentStatus${attempt.status.toLowerCase()}`}>
                        {statusLabel(attempt.status)}
                      </span>
                    </td>
                    <td>
                      {attempt.receipt_url ? (
                        <a href={attempt.receipt_url} rel="noreferrer" target="_blank">
                          Receipt <ExternalLink aria-hidden="true" size={13} />
                        </a>
                      ) : attempt.provider_reference ? (
                        <span title={attempt.provider_reference}>
                          {referenceLabel(attempt.provider_reference)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
