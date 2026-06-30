'use client';

import type {
  CatalogContext,
  ProblemResponse,
  SessionCreate,
  SessionDetail,
  SessionUpdate,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

interface FormState {
  age_as_of: SessionUpdate['age_as_of'];
  capacity: string;
  code: string;
  deposit: string;
  ends_on: string;
  maximum_grade: string;
  maximum_age: string;
  minimum_grade: string;
  minimum_age: string;
  name: string;
  price: string;
  program_id: string;
  registration_closes_local: string;
  registration_opens_local: string;
  season_id: string;
  starts_on: string;
  status: SessionUpdate['status'];
  version: number;
  waitlist_enabled: boolean;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function utcToZonedInput(iso: string, timeZone: string): string {
  const parts = zonedParts(new Date(iso), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedInputToUtc(value: string, timeZone: string): string {
  const [datePart = '', timePart = ''] = value.split('T');
  const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0] = timePart.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;

  for (let index = 0; index < 3; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess += target - represented;
  }

  return new Date(guess).toISOString().replace('.000Z', 'Z');
}

function fromSession(session: SessionDetail): FormState {
  return {
    age_as_of: session.age_as_of,
    capacity: String(session.capacity),
    code: session.code,
    deposit: (session.deposit_cents / 100).toFixed(2),
    ends_on: session.ends_on,
    maximum_age: String(session.maximum_age),
    maximum_grade: String(session.maximum_grade),
    minimum_age: String(session.minimum_age),
    minimum_grade: String(session.minimum_grade),
    name: session.name,
    price: (session.price_cents / 100).toFixed(2),
    program_id: session.program_id,
    registration_closes_local: utcToZonedInput(
      session.registration_closes_at,
      session.organization_timezone,
    ),
    registration_opens_local: utcToZonedInput(
      session.registration_opens_at,
      session.organization_timezone,
    ),
    season_id: session.season_id,
    starts_on: session.starts_on,
    status: session.status,
    version: session.version,
    waitlist_enabled: session.waitlist_enabled,
  };
}

function moneyToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function programDefaults(
  program: CatalogContext['programs'][number],
): Pick<
  FormState,
  | 'age_as_of'
  | 'capacity'
  | 'deposit'
  | 'maximum_age'
  | 'maximum_grade'
  | 'minimum_age'
  | 'minimum_grade'
  | 'price'
  | 'waitlist_enabled'
> {
  return {
    age_as_of: program.default_age_as_of,
    capacity: String(program.default_capacity),
    deposit: (program.default_deposit_cents / 100).toFixed(2),
    maximum_age: String(program.default_maximum_age),
    maximum_grade: String(program.default_maximum_grade),
    minimum_age: String(program.default_minimum_age),
    minimum_grade: String(program.default_minimum_grade),
    price: (program.default_price_cents / 100).toFixed(2),
    waitlist_enabled: program.default_waitlist_enabled,
  };
}

export function SessionEditor({
  mode = 'edit',
  programs,
  seasons,
  session,
}: {
  mode?: 'create' | 'edit';
  programs: CatalogContext['programs'];
  seasons: CatalogContext['seasons'];
  session: SessionDetail;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromSession(session));
  const [baseline, setBaseline] = useState<FormState>(() => fromSession(session));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [baseline, form]);
  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === form.program_id),
    [form.program_id, programs],
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    const beforeLink = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented) return;
      const target = event.target as Element | null;
      const link = target?.closest('a');
      if (!link || link.target === '_blank') return;
      if (!window.confirm('Discard unsaved session changes?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeLink, true);
    };
  }, [dirty]);

  const set = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)),
    );
    setMessage(null);
  };

  const setProgram = (programId: string) => {
    const program = programs.find((candidate) => candidate.id === programId);
    setForm((current) => ({
      ...current,
      ...(mode === 'create' && program ? programDefaults(program) : {}),
      program_id: programId,
    }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => field !== 'program_id')),
    );
    setMessage(null);
  };

  const buildUpdate = (): SessionUpdate => ({
    age_as_of: form.age_as_of,
    capacity: Number(form.capacity),
    deposit_cents: moneyToCents(form.deposit),
    ends_on: form.ends_on,
    maximum_age: Number(form.maximum_age),
    minimum_age: Number(form.minimum_age),
    name: form.name.trim(),
    price_cents: moneyToCents(form.price),
    program_id: form.program_id,
    registration_closes_at: zonedInputToUtc(
      form.registration_closes_local,
      session.organization_timezone,
    ),
    registration_opens_at: zonedInputToUtc(
      form.registration_opens_local,
      session.organization_timezone,
    ),
    season_id: form.season_id,
    starts_on: form.starts_on,
    status: form.status,
    version: form.version,
    waitlist_enabled: form.waitlist_enabled,
  });

  const buildCreate = (): SessionCreate => {
    const update = buildUpdate();
    return {
      code: form.code.trim().toUpperCase(),
      ends_on: update.ends_on,
      name: update.name,
      program_id: update.program_id,
      registration_closes_at: update.registration_closes_at,
      registration_opens_at: update.registration_opens_at,
      season_id: form.season_id,
      starts_on: update.starts_on,
      status: update.status,
    };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const creating = mode === 'create';
      const response = await fetch(
        creating ? '/api/v1/sessions' : `/api/v1/sessions/${session.id}`,
        {
          body: JSON.stringify(creating ? buildCreate() : buildUpdate()),
          headers: { 'content-type': 'application/json' },
          method: creating ? 'POST' : 'PATCH',
        },
      );
      const result = (await response.json()) as SessionDetail | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage({ tone: 'error', text: problem.message });
        return;
      }

      const savedSession = result as SessionDetail;
      if (creating) {
        router.replace(`/sessions/${savedSession.id}`);
        router.refresh();
        return;
      }
      const saved = fromSession(savedSession);
      setForm(saved);
      setBaseline(saved);
      setFieldErrors({});
      setMessage({ tone: 'success', text: 'Session changes saved.' });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'The session could not be saved. Try again.' });
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

      <section className="editorSection" aria-labelledby="session-basics">
        <div className="editorSectionHeading">
          <h2 id="session-basics">Session details</h2>
          <p>Public name, program, dates, and publication state.</p>
        </div>
        <div className="fieldGrid">
          {mode === 'create' && (
            <Field label="Session code" error={fieldErrors.code}>
              <input
                name="code"
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                required
                maxLength={64}
                pattern="[A-Z0-9-]+"
                placeholder="DAY-2027-10"
              />
            </Field>
          )}
          <Field
            label="Session name"
            error={fieldErrors.name}
            span={mode === 'edit' ? 'wide' : undefined}
          >
            <input
              name="name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              required
              maxLength={160}
            />
          </Field>
          <Field label="Program" error={fieldErrors.program_id}>
            <select
              name="program_id"
              value={form.program_id}
              onChange={(event) => setProgram(event.target.value)}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Season" error={fieldErrors.season_id}>
            <select
              name="season_id"
              value={form.season_id}
              onChange={(event) => set('season_id', event.target.value)}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={fieldErrors.status}>
            <select
              name="status"
              value={form.status}
              onChange={(event) => set('status', event.target.value as FormState['status'])}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
          <Field label="Start date" error={fieldErrors.starts_on}>
            <input
              name="starts_on"
              type="date"
              value={form.starts_on}
              onChange={(event) => set('starts_on', event.target.value)}
              required
            />
          </Field>
          <Field label="End date" error={fieldErrors.ends_on}>
            <input
              name="ends_on"
              type="date"
              value={form.ends_on}
              onChange={(event) => set('ends_on', event.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      <section className="editorSection" aria-labelledby="registration-window">
        <div className="editorSectionHeading">
          <h2 id="registration-window">Registration window</h2>
          <p>Times are shown in {session.organization_timezone}.</p>
        </div>
        <div className="fieldGrid">
          <Field label="Registration opens" error={fieldErrors.registration_opens_at}>
            <input
              name="registration_opens_at"
              type="datetime-local"
              value={form.registration_opens_local}
              onChange={(event) => set('registration_opens_local', event.target.value)}
              required
            />
          </Field>
          <Field label="Registration closes" error={fieldErrors.registration_closes_at}>
            <input
              name="registration_closes_at"
              type="datetime-local"
              value={form.registration_closes_local}
              onChange={(event) => set('registration_closes_local', event.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      <section className="editorSection" aria-labelledby="eligibility-capacity">
        <div className="editorSectionHeading">
          <h2 id="eligibility-capacity">
            {mode === 'create' ? 'Program defaults' : 'Eligibility and capacity'}
          </h2>
          <p>
            {mode === 'create'
              ? 'New sessions inherit eligibility, capacity, pricing, and waitlist settings from the selected program.'
              : 'Enrollment totals are calculated from confirmed registrations and active holds.'}
          </p>
        </div>
        {mode === 'create' ? (
          <div className="fieldGrid fieldGridThree">
            <div className="readOnlyMetric">
              <span>Age range</span>
              <strong>
                {form.minimum_age}-{form.maximum_age}
              </strong>
            </div>
            <div className="readOnlyMetric">
              <span>Grade range</span>
              <strong>
                {form.minimum_grade === '0' ? 'K' : form.minimum_grade}-
                {form.maximum_grade === '0' ? 'K' : form.maximum_grade}
              </strong>
            </div>
            <div className="readOnlyMetric">
              <span>Age evaluated on</span>
              <strong>
                {form.age_as_of === 'SESSION_START' ? 'Session start' : 'Season start'}
              </strong>
            </div>
            <div className="readOnlyMetric">
              <span>Capacity</span>
              <strong>{form.capacity}</strong>
            </div>
            <div className="readOnlyMetric">
              <span>Tuition</span>
              <strong>
                {selectedProgram ? money(selectedProgram.default_price_cents) : '$0.00'}
              </strong>
            </div>
            <div className="readOnlyMetric">
              <span>Deposit</span>
              <strong>
                {selectedProgram ? money(selectedProgram.default_deposit_cents) : '$0.00'}
              </strong>
            </div>
            <div className="readOnlyMetric">
              <span>Waitlist</span>
              <strong>{form.waitlist_enabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
          </div>
        ) : (
          <div className="fieldGrid fieldGridThree">
            <Field label="Minimum age" error={fieldErrors.minimum_age}>
              <input
                name="minimum_age"
                type="number"
                min="0"
                max="21"
                value={form.minimum_age}
                onChange={(event) => set('minimum_age', event.target.value)}
                required
              />
            </Field>
            <Field label="Maximum age" error={fieldErrors.maximum_age}>
              <input
                name="maximum_age"
                type="number"
                min="0"
                max="21"
                value={form.maximum_age}
                onChange={(event) => set('maximum_age', event.target.value)}
                required
              />
            </Field>
            <Field label="Age evaluated on" error={fieldErrors.age_as_of}>
              <select
                name="age_as_of"
                value={form.age_as_of}
                onChange={(event) => set('age_as_of', event.target.value as FormState['age_as_of'])}
              >
                <option value="SESSION_START">Session start</option>
                <option value="SEASON_START">Season start</option>
              </select>
            </Field>
            <Field label="Capacity" error={fieldErrors.capacity}>
              <input
                name="capacity"
                type="number"
                min={session.registered_count + session.active_hold_count || 1}
                value={form.capacity}
                onChange={(event) => set('capacity', event.target.value)}
                required
              />
            </Field>
            <div className="readOnlyMetric">
              <span>Registered</span>
              <strong>{session.registered_count}</strong>
            </div>
            <div className="readOnlyMetric">
              <span>Active holds</span>
              <strong>{session.active_hold_count}</strong>
            </div>
          </div>
        )}
      </section>

      {mode === 'edit' && (
        <section className="editorSection" aria-labelledby="pricing-waitlist">
          <div className="editorSectionHeading">
            <h2 id="pricing-waitlist">Pricing and waitlist</h2>
            <p>Amounts are stored as USD cents and displayed as dollars.</p>
          </div>
          <div className="fieldGrid">
            <Field label="Tuition" error={fieldErrors.price_cents} prefix="$">
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => set('price', event.target.value)}
                required
              />
            </Field>
            <Field label="Deposit" error={fieldErrors.deposit_cents} prefix="$">
              <input
                name="deposit"
                type="number"
                min="0"
                step="0.01"
                value={form.deposit}
                onChange={(event) => set('deposit', event.target.value)}
                required
              />
            </Field>
            <label className="toggleField fieldWide">
              <input
                type="checkbox"
                checked={form.waitlist_enabled}
                onChange={(event) => set('waitlist_enabled', event.target.checked)}
              />
              <span>
                <strong>Enable waitlist</strong>
                <small>Allow families to join an ordered waitlist when capacity is full.</small>
              </span>
            </label>
          </div>
        </section>
      )}

      <div className="editorActions">
        <span className="dirtyIndicator" aria-live="polite">
          {dirty
            ? 'Unsaved changes'
            : mode === 'create'
              ? 'New session'
              : `Version ${form.version}`}
        </span>
        <div>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => router.push('/sessions')}
          >
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={!dirty || saving}>
            <Save size={17} aria-hidden="true" />
            {saving
              ? mode === 'create'
                ? 'Creating...'
                : 'Saving...'
              : mode === 'create'
                ? 'Create session'
                : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
  prefix,
  span,
}: {
  children: ReactNode;
  error?: string | undefined;
  label: string;
  prefix?: string | undefined;
  span?: 'wide' | undefined;
}) {
  return (
    <label
      className={`formField${span === 'wide' ? ' fieldWide' : ''}${error ? ' fieldError' : ''}`}
    >
      <span>{label}</span>
      <div className={prefix ? 'inputWithPrefix' : undefined}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        {children}
      </div>
      {error && <small>{error}</small>}
    </label>
  );
}
