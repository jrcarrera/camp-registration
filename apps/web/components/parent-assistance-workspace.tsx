'use client';

import type {
  FamilyDetail,
  FinancialAssistanceApplication,
  ProblemResponse,
  SeasonFixture,
} from '@camp-registration/contracts';
import { CircleDollarSign, FilePenLine, Send, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

interface Props {
  applications: FinancialAssistanceApplication[];
  family: FamilyDetail;
  headers: Record<string, string>;
  seasons: SeasonFixture[];
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function isProblem(value: unknown): value is ProblemResponse {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}

export function ParentAssistanceWorkspace({
  applications: initial,
  family,
  headers,
  seasons,
}: Props) {
  const [applications, setApplications] = useState(initial);
  const [editing, setEditing] = useState<FinancialAssistanceApplication | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const submit = form.get('action') === 'submit';
    const payload = {
      camper_id: String(form.get('camper_id') || '') || null,
      requested_cents: Math.round(Number(form.get('requested_amount')) * 100),
      statement: String(form.get('statement') || ''),
      submit,
      ...(editing ? { version: editing.version } : { season_id: String(form.get('season_id')) }),
    };
    const response = await fetch(
      editing
        ? `/api/v1/families/${family.id}/financial-assistance/${editing.id}`
        : `/api/v1/families/${family.id}/financial-assistance`,
      {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json', ...headers },
        method: editing ? 'PUT' : 'POST',
      },
    );
    const result = (await response.json()) as FinancialAssistanceApplication | ProblemResponse;
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setApplications((current) => [result, ...current.filter((item) => item.id !== result.id)]);
    setEditing(null);
    event.currentTarget.reset();
    setMessage(submit ? 'Application submitted for review.' : 'Draft saved.');
  };

  const withdraw = async (application: FinancialAssistanceApplication) => {
    setBusy(true);
    const response = await fetch(
      `/api/v1/families/${family.id}/financial-assistance/${application.id}/withdraw`,
      {
        body: JSON.stringify({ version: application.version }),
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
      },
    );
    const result = (await response.json()) as FinancialAssistanceApplication | ProblemResponse;
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setApplications((current) => current.map((item) => (item.id === result.id ? result : item)));
  };

  return (
    <div className="financeWorkspace">
      <section aria-labelledby="assistance-form-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="assistance-form-heading">
              {editing ? 'Update application' : 'Request assistance'}
            </h2>
            <p className="sectionDescription">
              Your statement is private and visible only to authorized review staff.
            </p>
          </div>
        </div>
        <form className="financeForm" key={editing?.id ?? 'new'} onSubmit={save}>
          <label>
            <span>Camp season</span>
            <select
              defaultValue={editing?.season_id ?? seasons[0]?.id}
              disabled={Boolean(editing)}
              name="season_id"
              required
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} {season.year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Camper scope</span>
            <select defaultValue={editing?.camper_id ?? ''} name="camper_id">
              <option value="">All campers in household</option>
              {family.campers.map((camper) => (
                <option key={camper.id} value={camper.id}>
                  {camper.preferred_name || camper.first_name} {camper.last_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount requested</span>
            <input
              defaultValue={editing ? editing.requested_cents / 100 : ''}
              min="0.01"
              name="requested_amount"
              placeholder="0.00"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label className="fullWidth">
            <span>Private statement</span>
            <textarea
              defaultValue={editing?.statement ?? ''}
              minLength={10}
              name="statement"
              required
              rows={6}
            />
          </label>
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          <div className="inlineActions">
            <button
              className="buttonSecondary"
              disabled={busy}
              name="action"
              type="submit"
              value="draft"
            >
              <FilePenLine size={17} /> Save draft
            </button>
            <button
              className="buttonPrimary"
              disabled={busy}
              name="action"
              type="submit"
              value="submit"
            >
              <Send size={17} /> Submit for review
            </button>
            {editing && (
              <button className="buttonSecondary" onClick={() => setEditing(null)} type="button">
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section aria-labelledby="assistance-history-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="assistance-history-heading">Application history</h2>
          </div>
        </div>
        {applications.length === 0 ? (
          <p className="emptyStateText">No financial assistance applications yet.</p>
        ) : (
          <div className="financeCards">
            {applications.map((application) => {
              const editable = ['DRAFT', 'REVISION_REQUESTED'].includes(application.status);
              const withdrawable = ['DRAFT', 'SUBMITTED', 'REVISION_REQUESTED'].includes(
                application.status,
              );
              return (
                <article className="financeCard" key={application.id}>
                  <span className="statusBadge">
                    {application.status.replaceAll('_', ' ').toLowerCase()}
                  </span>
                  <h3>{money(application.requested_cents)} requested</h3>
                  <p>{application.statement}</p>
                  {application.approved_cents && (
                    <strong>
                      <CircleDollarSign size={15} /> {money(application.approved_cents)} approved
                    </strong>
                  )}
                  <div className="inlineActions">
                    {editable && (
                      <button
                        className="buttonSecondary"
                        disabled={busy}
                        onClick={() => setEditing(application)}
                        type="button"
                      >
                        Edit
                      </button>
                    )}
                    {withdrawable && (
                      <button
                        className="buttonSecondary dangerButton"
                        disabled={busy}
                        onClick={() => withdraw(application)}
                        type="button"
                      >
                        <XCircle size={16} /> Withdraw
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
