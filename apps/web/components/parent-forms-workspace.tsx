'use client';

import type {
  FormSubmission,
  ParentFormObligation,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, FileCheck2, Save, Send } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ParentFormsWorkspaceProps {
  initialObligations: ParentFormObligation[];
  requestHeaders: Record<string, string>;
}

function isProblem(value: FormSubmission | ProblemResponse): value is ProblemResponse {
  return 'code' in value;
}

function formatDueDate(value: string | null): string {
  if (!value) return 'No due date';
  return `Due ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value))}`;
}

function ObligationForm({
  obligation,
  onSaved,
  requestHeaders,
}: {
  obligation: ParentFormObligation;
  onSaved: (submission: FormSubmission) => void;
  requestHeaders: Record<string, string>;
}) {
  const [responses, setResponses] = useState<Record<string, string | boolean>>(
    obligation.submission?.responses ?? {},
  );
  const [signerName, setSignerName] = useState(obligation.submission?.signer_name ?? '');
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const submitted = obligation.submission?.status === 'SUBMITTED';
  const hasSignature = obligation.fields.some((field) => field.type === 'SIGNATURE');
  const save = async (submit: boolean) => {
    setSaving(submit ? 'submit' : 'draft');
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/portal/forms/${obligation.assignment_id}/registrations/${obligation.registration_id}`,
        {
          body: JSON.stringify({
            responses,
            signer_name: signerName.trim() || null,
            submit,
            version: obligation.submission?.version ?? 0,
          }),
          headers: { ...requestHeaders, 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      );
      const result = (await response.json()) as FormSubmission | ProblemResponse;
      if (isProblem(result)) {
        setMessage({ text: result.message, tone: 'error' });
      } else {
        onSaved(result);
        setMessage({
          text: submit ? 'Form submitted. This published response is now locked.' : 'Draft saved.',
          tone: 'success',
        });
      }
    } catch {
      setMessage({ text: 'The form could not be saved.', tone: 'error' });
    } finally {
      setSaving(null);
    }
  };
  return (
    <article className={`parentFormCard${submitted ? ' parentFormComplete' : ''}`}>
      <header className="parentFormHeader">
        <div>
          <p className="contextLabel">
            {obligation.camper_name} · {obligation.session_name}
          </p>
          <h2>{obligation.form_name}</h2>
          <p>{obligation.description}</p>
        </div>
        <div className="parentFormStatus">
          <span className={`statusBadge${submitted ? ' statusPublished' : ''}`}>
            {submitted ? 'Complete' : 'Required'}
          </span>
          <small>
            Version {obligation.form_version} · {formatDueDate(obligation.due_at)}
          </small>
        </div>
      </header>
      <div className="parentFormFields">
        {obligation.fields.map((field) => {
          const value = responses[field.id];
          if (field.type === 'ACKNOWLEDGEMENT') {
            return (
              <label className="parentAcknowledgement" key={field.id}>
                <input
                  type="checkbox"
                  checked={value === true}
                  disabled={submitted}
                  onChange={(event) =>
                    setResponses((current) => ({ ...current, [field.id]: event.target.checked }))
                  }
                  required={field.required}
                />
                <span>{field.label}</span>
              </label>
            );
          }
          if (field.type === 'SINGLE_CHOICE') {
            return (
              <label className="formField" key={field.id}>
                {field.label} {field.required && <span aria-hidden="true">*</span>}
                <select
                  value={typeof value === 'string' ? value : ''}
                  disabled={submitted}
                  onChange={(event) =>
                    setResponses((current) => ({ ...current, [field.id]: event.target.value }))
                  }
                  required={field.required}
                >
                  <option value="">Select an option</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (field.type === 'TEXT') {
            return (
              <label className="formField" key={field.id}>
                {field.label} {field.required && <span aria-hidden="true">*</span>}
                <textarea
                  value={typeof value === 'string' ? value : ''}
                  disabled={submitted}
                  onChange={(event) =>
                    setResponses((current) => ({ ...current, [field.id]: event.target.value }))
                  }
                  required={field.required}
                />
              </label>
            );
          }
          return (
            <label className="formField" key={field.id}>
              {field.label} {field.required && <span aria-hidden="true">*</span>}
              <input
                type={field.type === 'DATE' ? 'date' : 'text'}
                value={typeof value === 'string' ? value : ''}
                disabled={submitted}
                autoComplete={field.type === 'SIGNATURE' ? 'name' : undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  setResponses((current) => ({ ...current, [field.id]: next }));
                  if (field.type === 'SIGNATURE') setSignerName(next);
                }}
                required={field.required}
              />
              {field.type === 'SIGNATURE' && (
                <span className="fieldHint">Type your full legal name to sign electronically.</span>
              )}
            </label>
          );
        })}
        {hasSignature && (
          <p className="signatureDisclosure">
            By submitting, you confirm that the typed name is your electronic signature for this
            exact published version.
          </p>
        )}
      </div>
      {message && (
        <div
          className={`notice notice${message.tone === 'error' ? 'Error' : 'Success'}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.tone === 'error' ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {message.text}
        </div>
      )}
      {!submitted && (
        <div className="inlineActions parentFormActions">
          <button
            className="buttonSecondary"
            disabled={saving !== null}
            onClick={() => save(false)}
          >
            <Save size={16} aria-hidden="true" />
            {saving === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button className="buttonPrimary" disabled={saving !== null} onClick={() => save(true)}>
            <Send size={16} aria-hidden="true" />
            {saving === 'submit' ? 'Submitting…' : 'Submit form'}
          </button>
        </div>
      )}
    </article>
  );
}

export function ParentFormsWorkspace({
  initialObligations,
  requestHeaders,
}: ParentFormsWorkspaceProps) {
  const [obligations, setObligations] = useState(initialObligations);
  const counts = useMemo(() => {
    const complete = obligations.filter((item) => item.submission?.status === 'SUBMITTED').length;
    return { complete, remaining: obligations.length - complete };
  }, [obligations]);
  const update = (assignmentId: string, registrationId: string, submission: FormSubmission) =>
    setObligations((current) =>
      current.map((item) =>
        item.assignment_id === assignmentId && item.registration_id === registrationId
          ? { ...item, submission }
          : item,
      ),
    );
  return (
    <div className="parentFormsWorkspace">
      <section className="portalSummaryGrid" aria-label="Form completion summary">
        <div className="portalSummaryTile">
          <span aria-hidden="true">
            <FileCheck2 size={18} />
          </span>
          <div>
            <strong>{counts.complete}</strong>
            <small>forms complete</small>
          </div>
        </div>
        <div className="portalSummaryTile">
          <span aria-hidden="true">
            <AlertCircle size={18} />
          </span>
          <div>
            <strong>{counts.remaining}</strong>
            <small>forms remaining</small>
          </div>
        </div>
      </section>
      <section className="parentFormStack" aria-label="Required forms">
        {obligations.map((item) => (
          <ObligationForm
            key={`${item.assignment_id}:${item.registration_id}`}
            obligation={item}
            onSaved={(submission) => update(item.assignment_id, item.registration_id, submission)}
            requestHeaders={requestHeaders}
          />
        ))}
      </section>
    </div>
  );
}
