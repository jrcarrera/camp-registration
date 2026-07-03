'use client';

import type {
  CamperCreate,
  FamilyDetail,
  FamilyRegistrationResult,
  FamilySummary,
  ParentCheckoutCreate,
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
  adult_id: string | null;
  birth_date: string;
  school_grade: string | null;
}

function formatSessionOption(session: SessionDetail, now: Date): string {
  const registrationWindow = registrationWindowLabel(session, now);
  return `${session.name} - ${session.code} - ${registrationWindow} - ${session.registered_count}/${session.capacity} registered, ${session.waitlisted_count} waitlisted`;
}

function resultMessage(result: FamilyRegistrationResult): string {
  return result.registration.status === 'CONFIRMED'
    ? `${result.registration.session_name} registration confirmed.`
    : `${result.registration.session_name} waitlist spot added.`;
}

async function readFamily(
  familyId: string,
  requestHeaders?: Record<string, string>,
): Promise<FamilyDetail | ProblemResponse> {
  const response = await fetch(`/api/v1/families/${familyId}`, {
    ...(requestHeaders ? { headers: requestHeaders } : {}),
  });
  return (await response.json()) as FamilyDetail | ProblemResponse;
}

async function createCheckout(
  familyId: string,
  payload: ParentCheckoutCreate,
  requestHeaders?: Record<string, string>,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  const response = await fetch(`/api/v1/families/${familyId}/checkout`, {
    body: JSON.stringify(payload),
    headers: { ...(requestHeaders ?? {}), 'content-type': 'application/json' },
    method: 'POST',
  });
  return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
}

function currentLocalDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isCurrentOrFutureSession(session: SessionDetail, now: Date): boolean {
  return session.status === 'PUBLISHED' && session.ends_on >= currentLocalDate(now);
}

function hasAvailableRegistrationWindow(session: SessionDetail, now: Date): boolean {
  return new Date(session.registration_closes_at) > now;
}

function isRegistrationOpen(session: SessionDetail, now: Date): boolean {
  return (
    session.status === 'PUBLISHED' &&
    new Date(session.registration_opens_at) <= now &&
    now < new Date(session.registration_closes_at)
  );
}

function registrationWindowLabel(session: SessionDetail, now: Date): string {
  if (isRegistrationOpen(session, now)) return 'Open';
  if (new Date(session.registration_opens_at) > now) {
    return `Opens ${formatDate(session.registration_opens_at)}`;
  }
  return 'Closed';
}

function registrationWindowMessage(session: SessionDetail, now: Date): string {
  if (new Date(session.registration_opens_at) > now) {
    return `Registration for ${session.name} opens ${formatDate(session.registration_opens_at)}.`;
  }
  return `Registration for ${session.name} is closed.`;
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

function normalizedGrade(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const numeric = normalized.match(/\b(1[0-2]|[0-9])(?:st|nd|rd|th)?\b/);
  if (numeric?.[1]) return Number(numeric[1]);

  const aliases: Record<string, number> = {
    eighth: 8,
    eleventh: 11,
    fifth: 5,
    first: 1,
    fourth: 4,
    freshman: 9,
    junior: 11,
    k: 0,
    kindergarten: 0,
    ninth: 9,
    second: 2,
    senior: 12,
    seventh: 7,
    sixth: 6,
    sophomore: 10,
    tenth: 10,
    third: 3,
    twelfth: 12,
  };
  return aliases[normalized] ?? null;
}

function ageAsOfDate(session: SessionDetail, seasonYearsById: Record<string, number>): string {
  if (session.age_as_of === 'SESSION_START') return session.starts_on;
  const seasonYear =
    seasonYearsById[session.season_id] ??
    new Date(`${session.starts_on}T00:00:00Z`).getUTCFullYear();
  return `${seasonYear}-01-01`;
}

function isEligibleForSession(
  camper: CandidateCamper | null,
  session: SessionDetail,
  seasonYearsById: Record<string, number>,
): boolean {
  if (!camper?.birth_date) return false;
  const age = ageOn(camper.birth_date, ageAsOfDate(session, seasonYearsById));
  if (age === null || age < session.minimum_age || age > session.maximum_age) return false;
  if (camper.adult_id) return true;

  const grade = normalizedGrade(camper.school_grade);
  return Boolean(
    grade !== null && grade >= session.minimum_grade && grade <= session.maximum_grade,
  );
}

function camperFromForm(form: CamperForm): CandidateCamper | null {
  if (!form.birth_date) return null;
  return {
    adult_id: null,
    birth_date: form.birth_date,
    school_grade: nullable(form.school_grade),
  };
}

function preferredCamperId(family: FamilyDetail, initialCamperId?: string): string {
  if (initialCamperId && family.campers.some((camper) => camper.id === initialCamperId)) {
    return initialCamperId;
  }
  return family.campers[0]?.id ?? '';
}

interface RegistrationCheckoutClientProps {
  families: FamilySummary[];
  hideFamilySelector?: boolean;
  initialCamperId?: string | undefined;
  initialFamily?: FamilyDetail | null;
  requestHeaders?: Record<string, string>;
  returnHref?: string;
  returnLabel?: string;
  seasonYearsById: Record<string, number>;
  sessions: SessionDetail[];
}

export function RegistrationCheckoutClient({
  families,
  hideFamilySelector = false,
  initialCamperId,
  initialFamily = null,
  requestHeaders,
  returnHref = '/families',
  returnLabel = 'Families',
  seasonYearsById,
  sessions,
}: RegistrationCheckoutClientProps) {
  const [now, setNow] = useState(() => new Date());
  const candidateSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          isCurrentOrFutureSession(session, now) && hasAvailableRegistrationWindow(session, now),
      ),
    [now, sessions],
  );
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? families[0]?.id ?? '');
  const [family, setFamily] = useState<FamilyDetail | null>(initialFamily);
  const [camperMode, setCamperMode] = useState<'existing' | 'new'>('existing');
  const [camperId, setCamperId] = useState(() =>
    initialFamily ? preferredCamperId(initialFamily, initialCamperId) : (initialCamperId ?? ''),
  );
  const [sessionId, setSessionId] = useState('');
  const [camperForm, setCamperForm] = useState<CamperForm>(cleanCamperForm);
  const [state, setState] = useState<CheckoutState>(cleanState);

  const selectedCamper = useMemo<CandidateCamper | null>(() => {
    if (camperMode === 'new') return camperFromForm(camperForm);
    return family?.campers.find((camper) => camper.id === camperId) ?? null;
  }, [camperForm, camperId, camperMode, family?.campers]);

  const eligibleSessions = useMemo(
    () =>
      candidateSessions.filter((session) =>
        isEligibleForSession(selectedCamper, session, seasonYearsById),
      ),
    [candidateSessions, seasonYearsById, selectedCamper],
  );
  const selectedSession = useMemo(
    () => eligibleSessions.find((session) => session.id === sessionId) ?? null,
    [eligibleSessions, sessionId],
  );

  useEffect(() => {
    if (!familyId) {
      setFamily(null);
      setCamperId('');
      return;
    }
    let cancelled = false;
    setState(cleanState);
    if (initialFamily?.id === familyId) {
      setFamily(initialFamily);
      setCamperId(preferredCamperId(initialFamily, initialCamperId));
      return;
    }
    void readFamily(familyId, requestHeaders).then((result) => {
      if (cancelled) return;
      if ('code' in result) {
        setState(problemMessage(result));
        return;
      }
      setFamily(result);
      setCamperId(preferredCamperId(result, initialCamperId));
    });
    return () => {
      cancelled = true;
    };
  }, [familyId, initialCamperId, initialFamily, requestHeaders]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const setCamperField = <Key extends keyof CamperForm>(key: Key, value: CamperForm[Key]) => {
    setCamperForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  useEffect(() => {
    if (eligibleSessions.some((session) => session.id === sessionId)) return;
    const openSession = eligibleSessions.find((session) => isRegistrationOpen(session, now));
    setSessionId((openSession ?? eligibleSessions[0])?.id ?? '');
  }, [eligibleSessions, now, sessionId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!family) return;
    if (!sessionId) {
      setState({
        fieldErrors: { session_id: 'Select an eligible session.' },
        message: 'No eligible current or future session is available for this camper.',
        saving: false,
        tone: 'error',
      });
      return;
    }
    if (!selectedSession || !isRegistrationOpen(selectedSession, now)) {
      setState({
        fieldErrors: { session_id: 'Select a session with open registration.' },
        message: selectedSession
          ? registrationWindowMessage(selectedSession, now)
          : 'Select an eligible session.',
        saving: false,
        tone: 'error',
      });
      return;
    }
    setState({ ...cleanState, saving: true });

    const result = await createCheckout(
      family.id,
      {
        ...(camperMode === 'new'
          ? { new_camper: camperPayload(camperForm) }
          : { existing_camper_id: camperId }),
        session_id: sessionId,
      },
      requestHeaders,
    );
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
        {hideFamilySelector ? (
          <div className="selectedFamilyContext" aria-label="Household">
            <span>Household</span>
            <strong>{family?.family_name ?? 'Loading family'}</strong>
          </div>
        ) : (
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
        )}
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
                {formatSessionOption(session, now)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {candidateSessions.length === 0 && (
        <div className="notice noticeError" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          No current or future sessions are available for parent registration.
        </div>
      )}
      {candidateSessions.length > 0 && selectedCamper && eligibleSessions.length === 0 && (
        <div className="notice noticeError" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          This camper does not match the eligibility rules for a current or future session.
        </div>
      )}
      {selectedSession && !isRegistrationOpen(selectedSession, now) && (
        <div className="notice noticeError" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          {registrationWindowMessage(selectedSession, now)}
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
        <Link className="buttonSecondary" href={returnHref}>
          {returnLabel}
        </Link>
        <button
          className="buttonPrimary"
          type="submit"
          disabled={
            state.saving ||
            !family ||
            !sessionId ||
            !selectedSession ||
            !isRegistrationOpen(selectedSession, now) ||
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
