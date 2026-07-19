'use client';

import type { FinancialAssistanceApplication, ProblemResponse } from '@camp-registration/contracts';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}
function isProblem(value: unknown): value is ProblemResponse {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}

export function AssistanceReviewWorkspace({
  initial,
}: {
  initial: FinancialAssistanceApplication[];
}) {
  const [applications, setApplications] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = applications.filter((item) =>
    ['SUBMITTED', 'REVISION_REQUESTED'].includes(item.status),
  );

  const review = async (
    event: FormEvent<HTMLFormElement>,
    application: FinancialAssistanceApplication,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get('status')) as 'APPROVED' | 'DENIED' | 'REVISION_REQUESTED';
    setBusyId(application.id);
    setMessage(null);
    const response = await fetch(`/api/v1/financial-assistance/${application.id}/review`, {
      body: JSON.stringify({
        approved_cents:
          status === 'APPROVED' ? Math.round(Number(form.get('approved_amount')) * 100) : undefined,
        internal_note: String(form.get('internal_note') || '') || null,
        status,
        version: application.version,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as FinancialAssistanceApplication | ProblemResponse;
    setBusyId(null);
    if (isProblem(result)) return setMessage(result.message);
    setApplications((current) => current.map((item) => (item.id === result.id ? result : item)));
    setMessage(`Application marked ${result.status.replaceAll('_', ' ').toLowerCase()}.`);
  };

  return (
    <div className="financeWorkspace">
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Review queue</h2>
            <p className="sectionDescription">
              Private statements and internal decisions are audited.
            </p>
          </div>
          <span className="cartCount">{pending.length} open</span>
        </div>
        {pending.length === 0 ? (
          <p className="emptyStateText">No applications are waiting for review.</p>
        ) : (
          <div className="assistanceQueue">
            {pending.map((application) => (
              <article className="financeCard" key={application.id}>
                <header>
                  <div>
                    <p className="contextLabel">Family {application.family_id.slice(0, 8)}</p>
                    <h3>{money(application.requested_cents)} requested</h3>
                  </div>
                  <span className="statusBadge">
                    {application.status.replaceAll('_', ' ').toLowerCase()}
                  </span>
                </header>
                <p className="assistanceStatement">{application.statement}</p>
                <form className="financeForm" onSubmit={(event) => review(event, application)}>
                  <label>
                    <span>Approved amount</span>
                    <input
                      defaultValue={application.requested_cents / 100}
                      min="0.01"
                      name="approved_amount"
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label className="fullWidth">
                    <span>Internal review note</span>
                    <textarea name="internal_note" rows={3} />
                  </label>
                  <div className="inlineActions">
                    <button
                      className="buttonPrimary"
                      disabled={busyId !== null}
                      name="status"
                      type="submit"
                      value="APPROVED"
                    >
                      <CheckCircle2 size={16} /> Approve
                    </button>
                    <button
                      className="buttonSecondary"
                      disabled={busyId !== null}
                      name="status"
                      type="submit"
                      value="REVISION_REQUESTED"
                    >
                      <RotateCcw size={16} /> Request revision
                    </button>
                    <button
                      className="buttonSecondary dangerButton"
                      disabled={busyId !== null}
                      name="status"
                      type="submit"
                      value="DENIED"
                    >
                      <XCircle size={16} /> Deny
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Decision history</h2>
          </div>
        </div>
        <div className="financeCards">
          {applications
            .filter((item) => ['APPROVED', 'DENIED', 'WITHDRAWN'].includes(item.status))
            .map((item) => (
              <article className="financeCard" key={item.id}>
                <span className="statusBadge">{item.status.toLowerCase()}</span>
                <h3>{money(item.requested_cents)} requested</h3>
                {item.approved_cents && <p>{money(item.approved_cents)} approved</p>}
                <small>{item.internal_note || 'No internal note'}</small>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
