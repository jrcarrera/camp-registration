'use client';

import type {
  Camper,
  CamperCreate,
  FamilyDetail,
  FamilyRegistrationCreate,
  FamilyRegistrationResult,
  FamilySummary,
  ProblemResponse,
  SessionDetail,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

interface CheckoutState {
  fieldErrors: Record<string, string>;
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

interface CamperForm {
  birth_date: string;
  first_name: string;
  gender: '' | 'Female' | 'Male';
  last_name: string;
  school_grade: string;
}

const cleanState: CheckoutState = {
  fieldErrors: {},
  message: null,
  saving: false,
  tone: 'success',
};

const cleanCamperForm: CamperForm = {
  birth_date: '',
  first_name: '',
  gender: '',
  last_name: '',
  school_grade: '',
};

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string | undefined;
  label: string;
}) {
  return (
    <label className={`formField${error ? ' fieldError' : ''}`}>
      <span>{label}</span>
      {children}
      {error && <small>{error}</small>}
    </label>
  );
}

function Message({ state }: { state: CheckoutState }) {
  if (!state.message) return null;
  return (
    <div
      className={`notice notice${state.tone === 'error' ? 'Error' : 'Success'}`}
      role={state.tone === 'error' ? 'alert' : 'status'}
    >
      {state.tone === 'error' ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <CheckCircle2 size={18} aria-hidden="true" />
      )}
      {state.message}
    </div>
  );
}

function problemMessage(problem: ProblemResponse): CheckoutState {
  return {
    fieldErrors: problem.field_errors ?? {},
    message: problem.message,
    saving: false,
    tone: 'error',
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function camperPayload(form: CamperForm): CamperCreate {
  return {
    birth_date: form.birth_date,
    first_name: form.first_name.trim(),
    gender: form.gender || null,
    last_name: form.last_name.trim(),
    school_grade: nullable(form.school_grade),
  };
}

interface CandidateCamper {
  birth_date: string;
  school_grade: string | null;
}

function formatSessionOption(session: SessionDetail): string {
  return `${session.name} - ${session.code} - ${session.registered_count}/${session.capacity} registered, ${session.waitlisted_count} waitlisted`;
}

function resultMessage(result: FamilyRegistrationResult): string {
  return result.registration.status === 'CONFIRMED'
    ? `${result.registration.session_name} registration confirmed.`
    : `${result.registration.session_name} waitlist spot added.`;
}

async function readFamily(familyId: string): Promise<FamilyDetail | ProblemResponse> {
  const response = await fetch(`/api/v1/families/${familyId}`);
  return (await response.json()) as FamilyDetail | ProblemResponse;
}

async function createCamper(
  familyId: string,
  payload: CamperCreate,
): Promise<FamilyDetail | ProblemResponse> {
  const response = await fetch(`/api/v1/families/${familyId}/campers`, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return (await response.json()) as FamilyDetail | ProblemResponse;
}

async function createRegistration(
  familyId: string,
  payload: FamilyRegistrationCreate,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  const response = await fetch(`/api/v1/families/${familyId}/registrations`, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
}

function findCreatedCamper(family: FamilyDetail, payload: CamperCreate): Camper | undefined {
  return [...family.campers]
    .reverse()
    .find(
      (camper) =>
        camper.first_name === payload.first_name &&
        camper.last_name === payload.last_name &&
        camper.birth_date === payload.birth_date,
    );
}

function isRegistrationOpen(session: SessionDetail, now: Date): boolean {
  return (
    session.status === 'PUBLISHED' &&
    new Date(session.registration_opens_at) <= now &&
    now < new Date(session.registration_closes_at)
  );
}

function ageOn(birthDate: string, date: string): number | null {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const asOf = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.valueOf()) || Number.isNaN(asOf.valueOf())) return null;

  let years = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birth.getUTCDate())) {
    years -= 1;
  }
  return years;
}

function normalizedGrade(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const numeric = normalized.match(/\b(1[0-2]|[2-9])(?:st|nd|rd|th)?\b/);
  if (numeric) return numeric[1] ?? null;

  const aliases: Record<string, string> = {
    freshman: '9',
    ninth: '9',
    sophomore: '10',
    tenth: '10',
    junior: '11',
    eleventh: '11',
    senior: '12',
    twelfth: '12',
  };
  return aliases[normalized] ?? null;
}

function allowedGradesForSession(session: SessionDetail): string[] | null {
  const descriptor = `${session.program_name} ${session.code} ${session.name}`.toLowerCase();
  if (descriptor.includes('high school')) return ['9', '10', '11', '12'];
  if (descriptor.includes('junior high')) return ['6', '7', '8'];
  if (descriptor.includes('elementary')) return ['2', '3', '4', '5'];
  return null;
}

function isEligibleForSession(camper: CandidateCamper | null, session: SessionDetail): boolean {
  if (!camper?.birth_date) return false;
  const age = ageOn(camper.birth_date, session.starts_on);
  if (age === null || age < session.minimum_age || age > session.maximum_age) return false;

  const allowedGrades = allowedGradesForSession(session);
  if (!allowedGrades) return Boolean(camper.school_grade?.trim());

  const grade = normalizedGrade(camper.school_grade);
  return Boolean(grade && allowedGrades.includes(grade));
}

function camperFromForm(form: CamperForm): CandidateCamper | null {
  if (!form.birth_date) return null;
  return {
    birth_date: form.birth_date,
    school_grade: nullable(form.school_grade),
  };
}

export function RegistrationCheckoutClient({
  families,
  sessions,
}: {
  families: FamilySummary[];
  sessions: SessionDetail[];
}) {
  const parentOpenSessions = useMemo(
    () => sessions.filter((session) => isRegistrationOpen(session, new Date())),
    [sessions],
  );
  const [familyId, setFamilyId] = useState(families[0]?.id ?? '');
  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [camperMode, setCamperMode] = useState<'existing' | 'new'>('existing');
  const [camperId, setCamperId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [camperForm, setCamperForm] = useState<CamperForm>(cleanCamperForm);
  const [state, setState] = useState<CheckoutState>(cleanState);

  const selectedCamper = useMemo<CandidateCamper | null>(() => {
    if (camperMode === 'new') return camperFromForm(camperForm);
    return family?.campers.find((camper) => camper.id === camperId) ?? null;
  }, [camperForm, camperId, camperMode, family?.campers]);

  const eligibleSessions = useMemo(
    () => parentOpenSessions.filter((session) => isEligibleForSession(selectedCamper, session)),
    [parentOpenSessions, selectedCamper],
  );

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setState(cleanState);
    void readFamily(familyId).then((result) => {
      if (cancelled) return;
      if ('code' in result) {
        setState(problemMessage(result));
        return;
      }
      setFamily(result);
      setCamperId(result.campers[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const setCamperField = <Key extends keyof CamperForm>(key: Key, value: CamperForm[Key]) => {
    setCamperForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  useEffect(() => {
    if (eligibleSessions.some((session) => session.id === sessionId)) return;
    setSessionId(eligibleSessions[0]?.id ?? '');
  }, [eligibleSessions, sessionId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!family) return;
    if (!sessionId) {
      setState({
        fieldErrors: { session_id: 'Select an eligible open session.' },
        message: 'No eligible open session is available for this camper.',
        saving: false,
        tone: 'error',
      });
      return;
    }
    setState({ ...cleanState, saving: true });

    let selectedCamperId = camperId;
    if (camperMode === 'new') {
      const payload = camperPayload(camperForm);
      const created = await createCamper(family.id, payload);
      if ('code' in created) {
        setState(problemMessage(created));
        return;
      }
      setFamily(created);
      const createdCamper = findCreatedCamper(created, payload);
      selectedCamperId = createdCamper?.id ?? '';
      setCamperId(selectedCamperId);
      if (!selectedCamperId) {
        setState({
          fieldErrors: {},
          message: 'The camper was added, but registration could not continue.',
          saving: false,
          tone: 'error',
        });
        return;
      }
    }

    const result = await createRegistration(family.id, {
      camper_id: selectedCamperId,
      session_id: sessionId,
      source: 'PARENT',
    });
    if ('code' in result) {
      setState(problemMessage(result));
      return;
    }
    setFamily(result.family);
    setCamperMode('existing');
    setCamperForm(cleanCamperForm);
    setState({ ...cleanState, message: resultMessage(result) });
  };

  return (
    <form className="checkoutForm" onSubmit={submit}>
      <Message state={state} />
      <div className="fieldGrid">
        <Field label="Family account">
          <select
            value={familyId}
            onChange={(event) => {
              setFamilyId(event.target.value);
              setFamily(null);
            }}
            required
          >
            {families.map((familyOption) => (
              <option key={familyOption.id} value={familyOption.id}>
                {familyOption.family_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Session" error={state.fieldErrors.session_id}>
          <select
            value={sessionId}
            onChange={(event) => {
              setSessionId(event.target.value);
              setState(cleanState);
            }}
            required
          >
            {eligibleSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionOption(session)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {parentOpenSessions.length === 0 && (
        <div className="notice noticeError" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          No sessions are currently open for parent registration.
        </div>
      )}
      {parentOpenSessions.length > 0 && selectedCamper && eligibleSessions.length === 0 && (
        <div className="notice noticeError" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          This camper does not match the age and grade rules for an open session.
        </div>
      )}

      <div className="segmentedControl" role="group" aria-label="Camper selection mode">
        <button
          aria-pressed={camperMode === 'existing'}
          type="button"
          onClick={() => setCamperMode('existing')}
        >
          Existing camper
        </button>
        <button
          aria-pressed={camperMode === 'new'}
          type="button"
          onClick={() => setCamperMode('new')}
        >
          New camper
        </button>
      </div>

      {camperMode === 'existing' ? (
        <div className="fieldGrid">
          <Field label="Camper" error={state.fieldErrors.camper_id}>
            <select
              value={camperId}
              onChange={(event) => {
                setCamperId(event.target.value);
                setState(cleanState);
              }}
              required
            >
              {family?.campers.map((camper) => (
                <option key={camper.id} value={camper.id}>
                  {camper.first_name} {camper.last_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <div className="fieldGrid">
          <Field label="First name" error={state.fieldErrors.first_name}>
            <input
              value={camperForm.first_name}
              onChange={(event) => setCamperField('first_name', event.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <Field label="Last name" error={state.fieldErrors.last_name}>
            <input
              value={camperForm.last_name}
              onChange={(event) => setCamperField('last_name', event.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <Field label="Birth date" error={state.fieldErrors.birth_date}>
            <input
              type="date"
              value={camperForm.birth_date}
              onChange={(event) => setCamperField('birth_date', event.target.value)}
              required
            />
          </Field>
          <Field label="Gender">
            <select
              value={camperForm.gender}
              onChange={(event) =>
                setCamperField('gender', event.target.value as CamperForm['gender'])
              }
            >
              <option value="">Not set</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </Field>
          <Field label="School grade" error={state.fieldErrors.camper_id}>
            <input
              value={camperForm.school_grade}
              onChange={(event) => setCamperField('school_grade', event.target.value)}
              maxLength={40}
              required
            />
          </Field>
        </div>
      )}

      <div className="inlineActions">
        <Link className="buttonSecondary" href="/families">
          Families
        </Link>
        <button
          className="buttonPrimary"
          type="submit"
          disabled={
            state.saving ||
            !family ||
            !sessionId ||
            eligibleSessions.length === 0 ||
            (camperMode === 'existing' && !camperId)
          }
        >
          <Plus size={17} aria-hidden="true" />
          {state.saving ? 'Registering...' : 'Submit registration'}
        </button>
      </div>
    </form>
  );
}
