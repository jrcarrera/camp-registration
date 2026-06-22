'use client';

import type { ProblemResponse, ProgramCreate, ProgramFixture } from '@camp-registration/contracts';
import { AlertCircle, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const initialProgram: ProgramCreate = {
  code: '',
  delivery_mode: 'DAY',
  description: '',
  name: '',
};

export function ProgramCreateForm() {
  const router = useRouter();
  const [program, setProgram] = useState(initialProgram);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof ProgramCreate>(key: Key, value: ProgramCreate[Key]) => {
    setProgram((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)),
    );
    setMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/programs', {
        body: JSON.stringify({
          ...program,
          code: program.code.trim().toUpperCase(),
          description: program.description.trim(),
          name: program.name.trim(),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const result = (await response.json()) as ProgramFixture | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage(problem.message);
        return;
      }
      router.replace('/programs');
      router.refresh();
    } catch {
      setMessage('The program could not be created. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="editorForm" onSubmit={submit}>
      {message && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {message}
        </div>
      )}
      <section className="editorSection" aria-labelledby="program-details">
        <div className="editorSectionHeading">
          <h2 id="program-details">Program details</h2>
          <p>Codes are unique within the organization and cannot be changed after creation.</p>
        </div>
        <div className="fieldGrid">
          <label className={`formField${fieldErrors.code ? ' fieldError' : ''}`}>
            <span>Program code</span>
            <input
              value={program.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              maxLength={64}
              pattern="[A-Z0-9-]+"
              placeholder="TEEN-LEADERSHIP"
              required
            />
            {fieldErrors.code && <small>{fieldErrors.code}</small>}
          </label>
          <label className={`formField${fieldErrors.name ? ' fieldError' : ''}`}>
            <span>Program name</span>
            <input
              value={program.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={160}
              required
            />
            {fieldErrors.name && <small>{fieldErrors.name}</small>}
          </label>
          <label className="formField">
            <span>Delivery mode</span>
            <select
              value={program.delivery_mode}
              onChange={(event) =>
                set('delivery_mode', event.target.value as ProgramCreate['delivery_mode'])
              }
            >
              <option value="DAY">Day</option>
              <option value="OVERNIGHT">Overnight</option>
            </select>
          </label>
          <label className={`formField fieldWide${fieldErrors.description ? ' fieldError' : ''}`}>
            <span>Description</span>
            <textarea
              value={program.description}
              onChange={(event) => set('description', event.target.value)}
              maxLength={1000}
              rows={4}
              required
            />
            {fieldErrors.description && <small>{fieldErrors.description}</small>}
          </label>
        </div>
      </section>
      <div className="editorActions">
        <span className="dirtyIndicator">New program</span>
        <div>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => router.push('/programs')}
          >
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={saving}>
            <Save size={17} aria-hidden="true" />
            {saving ? 'Creating...' : 'Create program'}
          </button>
        </div>
      </div>
    </form>
  );
}
