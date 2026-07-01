'use client';

import type {
  ProblemResponse,
  ProgramCreate,
  ProgramFixture,
  ProgramUpdate,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

interface ProgramForm {
  code: string;
  default_age_as_of: ProgramCreate['default_age_as_of'];
  default_capacity: string;
  default_deposit: string;
  default_maximum_age: string;
  default_maximum_grade: string;
  default_minimum_age: string;
  default_minimum_grade: string;
  default_price: string;
  default_waitlist_enabled: boolean;
  delivery_mode: ProgramCreate['delivery_mode'];
  description: string;
  name: string;
}

const initialProgram: ProgramForm = {
  code: '',
  default_age_as_of: 'SESSION_START',
  default_capacity: '20',
  default_deposit: '0.00',
  default_maximum_age: '18',
  default_maximum_grade: '12',
  default_minimum_age: '5',
  default_minimum_grade: '0',
  default_price: '0.00',
  default_waitlist_enabled: true,
  delivery_mode: 'DAY',
  description: '',
  name: '',
};

function moneyToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function fromProgram(program: ProgramFixture): ProgramForm {
  return {
    code: program.code,
    default_age_as_of: program.default_age_as_of,
    default_capacity: String(program.default_capacity),
    default_deposit: (program.default_deposit_cents / 100).toFixed(2),
    default_maximum_age: String(program.default_maximum_age),
    default_maximum_grade: String(program.default_maximum_grade),
    default_minimum_age: String(program.default_minimum_age),
    default_minimum_grade: String(program.default_minimum_grade),
    default_price: (program.default_price_cents / 100).toFixed(2),
    default_waitlist_enabled: program.default_waitlist_enabled,
    delivery_mode: program.delivery_mode,
    description: program.description,
    name: program.name,
  };
}

function buildUpdate(form: ProgramForm): ProgramUpdate {
  return {
    default_age_as_of: form.default_age_as_of,
    default_capacity: Number(form.default_capacity),
    default_deposit_cents: moneyToCents(form.default_deposit),
    default_maximum_age: Number(form.default_maximum_age),
    default_maximum_grade: Number(form.default_maximum_grade),
    default_minimum_age: Number(form.default_minimum_age),
    default_minimum_grade: Number(form.default_minimum_grade),
    default_price_cents: moneyToCents(form.default_price),
    default_waitlist_enabled: form.default_waitlist_enabled,
    delivery_mode: form.delivery_mode,
    description: form.description.trim(),
    name: form.name.trim(),
  };
}

function buildCreate(form: ProgramForm): ProgramCreate {
  return {
    ...buildUpdate(form),
    code: form.code.trim().toUpperCase(),
  };
}

function fieldAliases(key: keyof ProgramForm): Set<string> {
  if (key === 'default_price') return new Set([key, 'default_price_cents']);
  if (key === 'default_deposit') return new Set([key, 'default_deposit_cents']);
  return new Set<string>([key]);
}

export function ProgramCreateForm() {
  return <ProgramEditor mode="create" />;
}

export function ProgramEditor({
  mode = 'edit',
  program: existingProgram,
}: {
  mode?: 'create' | 'edit';
  program?: ProgramFixture;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => (mode === 'edit' && existingProgram ? fromProgram(existingProgram) : initialProgram),
    [existingProgram, mode],
  );
  const [form, setForm] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = mode === 'edit';
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [baseline, form]);

  const set = <Key extends keyof ProgramForm>(key: Key, value: ProgramForm[Key]) => {
    const relatedFields = fieldAliases(key);
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => !relatedFields.has(field))),
    );
    setMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const programId = existingProgram?.id;
    if (editing && !programId) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(editing ? `/api/v1/programs/${programId}` : '/api/v1/programs', {
        body: JSON.stringify(editing ? buildUpdate(form) : buildCreate(form)),
        headers: { 'content-type': 'application/json' },
        method: editing ? 'PATCH' : 'POST',
      });
      const result = (await response.json()) as ProgramFixture | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage({ tone: 'error', text: problem.message });
        return;
      }

      const savedProgram = result as ProgramFixture;
      if (!editing) {
        router.replace('/programs');
        router.refresh();
        return;
      }

      const saved = fromProgram(savedProgram);
      setForm(saved);
      setBaseline(saved);
      setFieldErrors({});
      setMessage({ tone: 'success', text: 'Program changes saved.' });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'The program could not be saved. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="editorForm" onSubmit={submit}>
      {message && (
        <div
          className={`notice notice${message.tone === 'error' ? 'Error' : 'Success'}`}
          role="status"
        >
          {message.tone === 'error' ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {message.text}
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
              value={form.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              maxLength={64}
              pattern="[A-Z0-9-]+"
              placeholder="TEEN-LEADERSHIP"
              readOnly={editing}
              required
            />
            {fieldErrors.code && <small>{fieldErrors.code}</small>}
          </label>
          <label className={`formField${fieldErrors.name ? ' fieldError' : ''}`}>
            <span>Program name</span>
            <input
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={160}
              required
            />
            {fieldErrors.name && <small>{fieldErrors.name}</small>}
          </label>
          <label className="formField">
            <span>Delivery mode</span>
            <select
              value={form.delivery_mode}
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
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              maxLength={1000}
              rows={4}
              required
            />
            {fieldErrors.description && <small>{fieldErrors.description}</small>}
          </label>
        </div>
      </section>
      <section className="editorSection" aria-labelledby="program-defaults">
        <div className="editorSectionHeading">
          <h2 id="program-defaults">Session defaults</h2>
          <p>New sessions created from this program inherit these values.</p>
        </div>
        <div className="fieldGrid fieldGridThree">
          <label className={`formField${fieldErrors.default_minimum_age ? ' fieldError' : ''}`}>
            <span>Minimum age</span>
            <input
              type="number"
              min="0"
              max="120"
              value={form.default_minimum_age}
              onChange={(event) => set('default_minimum_age', event.target.value)}
              required
            />
            {fieldErrors.default_minimum_age && <small>{fieldErrors.default_minimum_age}</small>}
          </label>
          <label className={`formField${fieldErrors.default_maximum_age ? ' fieldError' : ''}`}>
            <span>Maximum age</span>
            <input
              type="number"
              min="0"
              max="120"
              value={form.default_maximum_age}
              onChange={(event) => set('default_maximum_age', event.target.value)}
              required
            />
            {fieldErrors.default_maximum_age && <small>{fieldErrors.default_maximum_age}</small>}
          </label>
          <label className="formField">
            <span>Age evaluated on</span>
            <select
              value={form.default_age_as_of}
              onChange={(event) =>
                set('default_age_as_of', event.target.value as ProgramCreate['default_age_as_of'])
              }
            >
              <option value="SESSION_START">Session start</option>
              <option value="SEASON_START">Season start</option>
            </select>
          </label>
          <label className={`formField${fieldErrors.default_minimum_grade ? ' fieldError' : ''}`}>
            <span>Minimum grade</span>
            <input
              type="number"
              min="0"
              max="12"
              value={form.default_minimum_grade}
              onChange={(event) => set('default_minimum_grade', event.target.value)}
              required
            />
            {fieldErrors.default_minimum_grade && (
              <small>{fieldErrors.default_minimum_grade}</small>
            )}
          </label>
          <label className={`formField${fieldErrors.default_maximum_grade ? ' fieldError' : ''}`}>
            <span>Maximum grade</span>
            <input
              type="number"
              min="0"
              max="12"
              value={form.default_maximum_grade}
              onChange={(event) => set('default_maximum_grade', event.target.value)}
              required
            />
            {fieldErrors.default_maximum_grade && (
              <small>{fieldErrors.default_maximum_grade}</small>
            )}
          </label>
          <label className={`formField${fieldErrors.default_capacity ? ' fieldError' : ''}`}>
            <span>Capacity</span>
            <input
              type="number"
              min="1"
              value={form.default_capacity}
              onChange={(event) => set('default_capacity', event.target.value)}
              required
            />
            {fieldErrors.default_capacity && <small>{fieldErrors.default_capacity}</small>}
          </label>
          <label className={`formField${fieldErrors.default_price_cents ? ' fieldError' : ''}`}>
            <span>Tuition</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.default_price}
              onChange={(event) => set('default_price', event.target.value)}
              required
            />
            {fieldErrors.default_price_cents && <small>{fieldErrors.default_price_cents}</small>}
          </label>
          <label className={`formField${fieldErrors.default_deposit_cents ? ' fieldError' : ''}`}>
            <span>Deposit</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.default_deposit}
              onChange={(event) => set('default_deposit', event.target.value)}
              required
            />
            {fieldErrors.default_deposit_cents && (
              <small>{fieldErrors.default_deposit_cents}</small>
            )}
          </label>
          <label className="toggleField fieldWide">
            <input
              type="checkbox"
              checked={form.default_waitlist_enabled}
              onChange={(event) => set('default_waitlist_enabled', event.target.checked)}
            />
            <span>
              <strong>Enable waitlist by default</strong>
              <small>New sessions allow waitlisting when confirmed capacity is full.</small>
            </span>
          </label>
        </div>
      </section>
      <div className="editorActions">
        <span className="dirtyIndicator" aria-live="polite">
          {editing ? (dirty ? 'Unsaved changes' : 'Program saved') : 'New program'}
        </span>
        <div>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => router.push('/programs')}
          >
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={saving || (editing && !dirty)}>
            <Save size={17} aria-hidden="true" />
            {saving
              ? editing
                ? 'Saving...'
                : 'Creating...'
              : editing
                ? 'Save changes'
                : 'Create program'}
          </button>
        </div>
      </div>
    </form>
  );
}
