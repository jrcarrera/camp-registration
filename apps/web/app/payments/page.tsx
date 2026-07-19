import type { PaymentAttempt } from '@camp-registration/contracts';
import { AlertCircle, CircleDollarSign, ExternalLink } from 'lucide-react';

import { getPaymentAttempts } from '../../lib/api';

export const dynamic = 'force-dynamic';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function statusLabel(status: PaymentAttempt['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function timestampParts(value: string): { date: string; time: string } {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function referenceLabel(value: string): string {
  return value.length > 24 ? `${value.slice(0, 15)}…${value.slice(-6)}` : value;
}

export default async function PaymentsPage() {
  let attempts: PaymentAttempt[] = [];
  let loadError = false;
  try {
    attempts = (await getPaymentAttempts()).attempts;
  } catch {
    loadError = true;
  }

  const pending = attempts.filter((attempt) => attempt.status === 'PENDING').length;
  const succeeded = attempts.filter((attempt) => attempt.status === 'SUCCEEDED');
  const needsAttention = attempts.filter(
    (attempt) => attempt.status === 'FAILED' || attempt.status === 'CANCELLED',
  ).length;
  const received = succeeded.reduce((total, attempt) => total + attempt.amount_cents, 0);

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Finance operations</p>
          <h1>Online payments</h1>
          <p className="pageDescription">
            Reconcile hosted checkout attempts with the registration ledger.
          </p>
        </div>
      </header>

      <div className="portalSummaryGrid" aria-label="Online payment summary">
        <div className="portalSummaryTile">
          <span>
            <CircleDollarSign size={18} />
          </span>
          <div>
            <strong>{money(received)}</strong>
            <small>Deposits received</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <CircleDollarSign size={18} />
          </span>
          <div>
            <strong>{succeeded.length}</strong>
            <small>Successful payments</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <CircleDollarSign size={18} />
          </span>
          <div>
            <strong>{pending}</strong>
            <small>Pending attempts</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span>
            <AlertCircle size={18} />
          </span>
          <div>
            <strong>{needsAttention}</strong>
            <small>Needs attention</small>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} />
          Payment attempts could not be loaded.
        </div>
      ) : (
        <section className="contentSection" aria-labelledby="payment-attempts-heading">
          <div className="sectionHeading">
            <div>
              <h2 id="payment-attempts-heading">Checkout attempts</h2>
              <p className="sectionDescription">
                Provider state, internal registration, and receipt reference in one queue.
              </p>
            </div>
          </div>
          {attempts.length === 0 ? (
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
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>
                        <span className="paymentTimestamp">
                          {timestampParts(attempt.created_at).date}
                          <small>{timestampParts(attempt.created_at).time}</small>
                        </span>
                      </td>
                      <td>
                        <strong>{attempt.camper_name}</strong>
                        <br />
                        <span className="tableSecondary">{attempt.session_name}</span>
                      </td>
                      <td>{attempt.family_name}</td>
                      <td>{money(attempt.amount_cents)}</td>
                      <td>{attempt.provider === 'STRIPE' ? 'Stripe' : 'Local test'}</td>
                      <td>
                        <span
                          className={`statusBadge paymentStatus${attempt.status.toLowerCase()}`}
                        >
                          {statusLabel(attempt.status)}
                        </span>
                      </td>
                      <td className="paymentReferenceCell">
                        {attempt.receipt_url ? (
                          <a href={attempt.receipt_url} rel="noreferrer" target="_blank">
                            Receipt <ExternalLink size={13} />
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
      )}
    </>
  );
}
