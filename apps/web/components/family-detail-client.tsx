'use client';

import type {
  Adult,
  AdultCreate,
  AdultUpdate,
  Camper,
  CamperCreate,
  CamperUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  FamilyDetail,
  FamilyRegistrationCreate,
  FamilyRegistrationResult,
  FamilyUpdate,
  ProblemResponse,
  SessionSummary,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Plus, Save, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import { FamilyInvitationButton } from './family-invitation-button';

interface SaveState {
  fieldErrors: Record<string, string>;
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

const cleanState: SaveState = {
  fieldErrors: {},
  message: null,
  saving: false,
  tone: 'success',
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.valueOf())) return null;
  const today = new Date();
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

function roleLabel(label: string, birthDate: string | null): string {
  const age = ageFromBirthDate(birthDate);
  return age === null ? label : `${label} - Age ${age}`;
}

function problemMessage(problem: ProblemResponse): SaveState {
  return {
    fieldErrors: problem.field_errors ?? {},
    message: problem.message,
    saving: false,
    tone: 'error',
  };
}

function Field({
  children,
  error,
  label,
  wide,
}: {
  children: ReactNode;
  error?: string | undefined;
  label: string;
  wide?: boolean | undefined;
}) {
  return (
    <label className={`formField${wide ? ' fieldWide' : ''}${error ? ' fieldError' : ''}`}>
      <span>{label}</span>
      {children}
      {error && <small>{error}</small>}
    </label>
  );
}

function Message({ state }: { state: SaveState }) {
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

function PermissionToggles({
  form,
  set,
}: {
  form: AdultForm;
  set: <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => void;
}) {
  return (
    <div className="toggleGrid">
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.account_owner}
          onChange={(event) => set('account_owner', event.target.checked)}
        />
        <span>Family owner</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.can_manage_family}
          onChange={(event) => set('can_manage_family', event.target.checked)}
        />
        <span>Manage family</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.can_register}
          onChange={(event) => set('can_register', event.target.checked)}
        />
        <span>Register campers</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.can_make_payments}
          onChange={(event) => set('can_make_payments', event.target.checked)}
        />
        <span>Make payments</span>
      </label>
    </div>
  );
}

function AdultRoleToggles({
  form,
  set,
}: {
  form: AdultForm;
  set: <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => void;
}) {
  return (
    <div className="toggleGrid">
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.emergency_contact}
          onChange={(event) => set('emergency_contact', event.target.checked)}
        />
        <span>Emergency contact</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.authorized_pickup}
          onChange={(event) => set('authorized_pickup', event.target.checked)}
        />
        <span>Authorized pickup</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.receives_operational_communication}
          onChange={(event) => set('receives_operational_communication', event.target.checked)}
        />
        <span>Operational communication</span>
      </label>
    </div>
  );
}

function ContactRoleToggles({
  form,
  set,
}: {
  form: ContactForm;
  set: <Key extends keyof ContactForm>(key: Key, value: ContactForm[Key]) => void;
}) {
  return (
    <div className="toggleGrid">
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.emergency_contact}
          onChange={(event) => set('emergency_contact', event.target.checked)}
        />
        <span>Emergency contact</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.authorized_pickup}
          onChange={(event) => set('authorized_pickup', event.target.checked)}
        />
        <span>Authorized pickup</span>
      </label>
      <label className="checkField">
        <input
          type="checkbox"
          checked={form.receives_operational_communication}
          onChange={(event) => set('receives_operational_communication', event.target.checked)}
        />
        <span>Operational communication</span>
      </label>
    </div>
  );
}

interface FamilyDetailClientProps {
  initialFamily: FamilyDetail;
  sessions: SessionSummary[];
}

export function FamilyDetailClient({ initialFamily, sessions }: FamilyDetailClientProps) {
  const [family, setFamily] = useState(initialFamily);
  const router = useRouter();

  const saveFamily = (nextFamily: FamilyDetail) => {
    setFamily(nextFamily);
    router.refresh();
  };

  return (
    <div className="familyDetail">
      <FamilyNameForm family={family} onSaved={saveFamily} />
      <section className="editorSection" aria-labelledby="family-adults">
        <div className="editorSectionHeading">
          <h2 id="family-adults">Adults</h2>
          <p>Adults hold account access and family permissions.</p>
        </div>
        <div className="recordStack">
          {family.adults.map((adult) => {
            const linkedCamper = family.campers.find((camper) => camper.adult_id === adult.id);
            return (
              <AdultEditor
                key={adult.id}
                adult={adult}
                familyId={family.id}
                linkedCamper={linkedCamper}
                onSaved={saveFamily}
              />
            );
          })}
          <AdultCreatePanel
            familyId={family.id}
            isFirstAdult={family.adults.length === 0}
            onSaved={saveFamily}
          />
        </div>
      </section>

      <section className="editorSection" aria-labelledby="family-campers">
        <div className="editorSectionHeading">
          <h2 id="family-campers">Campers</h2>
          <p>Base camper profile only. Health records stay in the health domain.</p>
        </div>
        <div className="recordStack">
          {family.campers.map((camper) => (
            <CamperEditor
              key={camper.id}
              camper={camper}
              familyId={family.id}
              onSaved={saveFamily}
            />
          ))}
          <CamperCreatePanel familyId={family.id} onSaved={saveFamily} />
        </div>
        <AdminRegistrationPanel family={family} onSaved={saveFamily} sessions={sessions} />
      </section>

      <section className="editorSection" aria-labelledby="family-contacts">
        <div className="editorSectionHeading">
          <h2 id="family-contacts">Contacts</h2>
          <p>Emergency, pickup, and operational contacts without login access.</p>
        </div>
        <div className="recordStack">
          {family.contacts.map((contact) => (
            <ContactEditor
              key={contact.id}
              contact={contact}
              familyId={family.id}
              onSaved={saveFamily}
            />
          ))}
          <ContactCreatePanel familyId={family.id} onSaved={saveFamily} />
        </div>
      </section>
    </div>
  );
}

function FamilyNameForm({
  family,
  onSaved,
}: {
  family: FamilyDetail;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [familyName, setFamilyName] = useState(family.family_name);
  const [state, setState] = useState<SaveState>(cleanState);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const payload: FamilyUpdate = { family_name: familyName.trim(), version: family.version };
    const result = await writeFamily(`/api/v1/families/${family.id}`, 'PATCH', payload);
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setFamilyName(result.family_name);
    setState({ ...cleanState, message: 'Family details saved.' });
  };

  return (
    <section className="editorSection" aria-labelledby="family-account">
      <div className="editorSectionHeading">
        <h2 id="family-account">Family account</h2>
        <p>The family is the customer record for this household.</p>
      </div>
      <form className="familyInlineForm" onSubmit={submit}>
        <Message state={state} />
        <div className="fieldGrid">
          <Field label="Family name" error={state.fieldErrors.family_name}>
            <input
              value={familyName}
              onChange={(event) => {
                setFamilyName(event.target.value);
                setState(cleanState);
              }}
              maxLength={160}
              required
            />
          </Field>
        </div>
        <div className="inlineActions">
          <button className="buttonPrimary" type="submit" disabled={state.saving}>
            <Save size={17} aria-hidden="true" />
            {state.saving ? 'Saving...' : 'Save family'}
          </button>
        </div>
      </form>
    </section>
  );
}

interface AdultForm {
  account_owner: boolean;
  authorized_pickup: boolean;
  birth_date: string;
  can_make_payments: boolean;
  can_manage_family: boolean;
  can_register: boolean;
  email: string;
  emergency_contact: boolean;
  first_name: string;
  last_name: string;
  phone: string;
  receives_operational_communication: boolean;
  version: number;
}

function adultForm(adult?: Adult, isFirstAdult = false): AdultForm {
  return {
    account_owner: adult?.account_owner ?? isFirstAdult,
    authorized_pickup: adult?.authorized_pickup ?? false,
    birth_date: adult?.birth_date ?? '',
    can_make_payments: adult?.can_make_payments ?? isFirstAdult,
    can_manage_family: adult?.can_manage_family ?? isFirstAdult,
    can_register: adult?.can_register ?? isFirstAdult,
    email: adult?.email ?? '',
    emergency_contact: adult?.emergency_contact ?? false,
    first_name: adult?.first_name ?? '',
    last_name: adult?.last_name ?? '',
    phone: adult?.phone ?? '',
    receives_operational_communication: adult?.receives_operational_communication ?? false,
    version: adult?.version ?? 1,
  };
}

function adultCreatePayload(form: AdultForm): AdultCreate {
  return {
    account_owner: form.account_owner,
    authorized_pickup: form.authorized_pickup,
    birth_date: nullable(form.birth_date),
    can_make_payments: form.can_make_payments,
    can_manage_family: form.can_manage_family,
    can_register: form.can_register,
    email: nullable(form.email),
    emergency_contact: form.emergency_contact,
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone: nullable(form.phone),
    receives_operational_communication: form.receives_operational_communication,
  };
}

function adultUpdatePayload(form: AdultForm): AdultUpdate {
  return { ...adultCreatePayload(form), version: form.version };
}

type CamperGender = Exclude<CamperCreate['gender'], null | undefined>;
type CamperGenderValue = '' | CamperGender;

function nullableGender(value: CamperGenderValue): CamperGender | null {
  return value || null;
}

function AdultFields({
  form,
  state,
  set,
}: {
  form: AdultForm;
  state: SaveState;
  set: <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => void;
}) {
  return (
    <>
      <div className="fieldGrid">
        <Field label="First name" error={state.fieldErrors.first_name}>
          <input
            value={form.first_name}
            onChange={(event) => set('first_name', event.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Last name" error={state.fieldErrors.last_name}>
          <input
            value={form.last_name}
            onChange={(event) => set('last_name', event.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Birth date" error={state.fieldErrors.birth_date}>
          <input
            type="date"
            value={form.birth_date}
            onChange={(event) => set('birth_date', event.target.value)}
          />
        </Field>
        <Field label="Email" error={state.fieldErrors.email}>
          <input
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            inputMode="email"
            maxLength={254}
          />
        </Field>
        <Field label="Phone" error={state.fieldErrors.phone}>
          <input
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            maxLength={40}
          />
        </Field>
      </div>
      <PermissionToggles form={form} set={set} />
      <AdultRoleToggles form={form} set={set} />
    </>
  );
}

function AdultEditor({
  adult,
  familyId,
  linkedCamper,
  onSaved,
}: {
  adult: Adult;
  familyId: string;
  linkedCamper: Camper | undefined;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => adultForm(adult));
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const addAsCamper = async () => {
    if (!form.birth_date) {
      setState({
        fieldErrors: { birth_date: 'Set a birth date before adding this adult as a camper.' },
        message: 'Birth date is required to add this adult as a camper.',
        saving: false,
        tone: 'error',
      });
      return;
    }
    setState({ ...cleanState, saving: true });
    const payload: CamperCreate = {
      accessibility_needs: null,
      adult_id: adult.id,
      birth_date: form.birth_date,
      cabin_preference: null,
      email: nullable(form.email),
      first_name: form.first_name.trim(),
      gender: null,
      last_name: form.last_name.trim(),
      preferred_name: null,
      school_grade: null,
    };
    const result = await writeFamily(`/api/v1/families/${familyId}/campers`, 'POST', payload);
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setState({ ...cleanState, message: 'Adult added as camper.' });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/adults/${adult.id}`,
      'PATCH',
      adultUpdatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    const savedAdult = result.adults.find((nextAdult) => nextAdult.id === adult.id);
    if (savedAdult) setForm(adultForm(savedAdult));
    onSaved(result);
    setState({ ...cleanState, message: 'Adult saved.' });
  };

  return (
    <form className="recordPanel" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>
          {adult.first_name} {adult.last_name}
        </strong>
        <span>
          {roleLabel(
            linkedCamper ? 'Adult camper' : adult.account_owner ? 'Owner' : 'Adult',
            adult.birth_date,
          )}
        </span>
      </div>
      <Message state={state} />
      <AdultFields form={form} state={state} set={set} />
      <div className="inlineActions">
        {!adult.identity_subject && adult.email ? (
          <FamilyInvitationButton adultId={adult.id} familyId={familyId} />
        ) : null}
        {linkedCamper ? (
          <Link className="buttonSecondary" href={`#camper-${linkedCamper.id}`}>
            Camper profile
          </Link>
        ) : (
          <button
            className="buttonSecondary"
            type="button"
            disabled={state.saving}
            onClick={addAsCamper}
          >
            <Plus size={17} aria-hidden="true" />
            Add as camper
          </button>
        )}
        <button className="buttonSecondary" type="submit" disabled={state.saving}>
          <Save size={17} aria-hidden="true" />
          {state.saving ? 'Saving...' : 'Save adult'}
        </button>
      </div>
    </form>
  );
}

function AdultCreatePanel({
  familyId,
  isFirstAdult,
  onSaved,
}: {
  familyId: string;
  isFirstAdult: boolean;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => adultForm(undefined, isFirstAdult));
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/adults`,
      'POST',
      adultCreatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setForm(adultForm(undefined, false));
    setState({ ...cleanState, message: 'Adult added.' });
  };

  return (
    <form className="recordPanel recordPanelNew" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>Add adult</strong>
        <span>Account access</span>
      </div>
      <Message state={state} />
      <AdultFields form={form} state={state} set={set} />
      <div className="inlineActions">
        <button className="buttonPrimary" type="submit" disabled={state.saving}>
          <Plus size={17} aria-hidden="true" />
          {state.saving ? 'Adding...' : 'Add adult'}
        </button>
      </div>
    </form>
  );
}

interface CamperForm {
  accessibility_needs: string;
  adult_id: string;
  birth_date: string;
  cabin_preference: string;
  email: string;
  first_name: string;
  gender: CamperGenderValue;
  last_name: string;
  preferred_name: string;
  school_grade: string;
  version: number;
}

function camperForm(camper?: Camper): CamperForm {
  return {
    accessibility_needs: camper?.accessibility_needs ?? '',
    adult_id: camper?.adult_id ?? '',
    birth_date: camper?.birth_date ?? '',
    cabin_preference: camper?.cabin_preference ?? '',
    email: camper?.email ?? '',
    first_name: camper?.first_name ?? '',
    gender: camper?.gender ?? '',
    last_name: camper?.last_name ?? '',
    preferred_name: camper?.preferred_name ?? '',
    school_grade: camper?.school_grade ?? '',
    version: camper?.version ?? 1,
  };
}

function camperCreatePayload(form: CamperForm): CamperCreate {
  return {
    accessibility_needs: nullable(form.accessibility_needs),
    adult_id: nullable(form.adult_id),
    birth_date: form.birth_date,
    cabin_preference: nullable(form.cabin_preference),
    email: nullable(form.email),
    first_name: form.first_name.trim(),
    gender: nullableGender(form.gender),
    last_name: form.last_name.trim(),
    preferred_name: nullable(form.preferred_name),
    school_grade: nullable(form.school_grade),
  };
}

function camperUpdatePayload(form: CamperForm): CamperUpdate {
  return { ...camperCreatePayload(form), version: form.version };
}

function CamperFields({
  form,
  state,
  set,
}: {
  form: CamperForm;
  state: SaveState;
  set: <Key extends keyof CamperForm>(key: Key, value: CamperForm[Key]) => void;
}) {
  return (
    <div className="fieldGrid">
      <Field label="First name" error={state.fieldErrors.first_name}>
        <input
          value={form.first_name}
          onChange={(event) => set('first_name', event.target.value)}
          maxLength={100}
          required
        />
      </Field>
      <Field label="Last name" error={state.fieldErrors.last_name}>
        <input
          value={form.last_name}
          onChange={(event) => set('last_name', event.target.value)}
          maxLength={100}
          required
        />
      </Field>
      <Field label="Birth date" error={state.fieldErrors.birth_date}>
        <input
          type="date"
          value={form.birth_date}
          onChange={(event) => set('birth_date', event.target.value)}
          required
        />
      </Field>
      <Field label="Email" error={state.fieldErrors.email}>
        <input
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          inputMode="email"
          maxLength={254}
        />
      </Field>
      <Field label="Preferred name">
        <input
          value={form.preferred_name}
          onChange={(event) => set('preferred_name', event.target.value)}
          maxLength={100}
        />
      </Field>
      <Field label="Gender">
        <select
          value={form.gender}
          onChange={(event) => set('gender', event.target.value as CamperGenderValue)}
        >
          <option value="">Not set</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
        </select>
      </Field>
      <Field label="School grade">
        <input
          value={form.school_grade}
          onChange={(event) => set('school_grade', event.target.value)}
          maxLength={40}
        />
      </Field>
      <Field label="Cabin preference">
        <input
          value={form.cabin_preference}
          onChange={(event) => set('cabin_preference', event.target.value)}
          maxLength={160}
        />
      </Field>
      <Field label="Accessibility needs">
        <input
          value={form.accessibility_needs}
          onChange={(event) => set('accessibility_needs', event.target.value)}
          maxLength={500}
        />
      </Field>
    </div>
  );
}

function CamperEditor({
  camper,
  familyId,
  onSaved,
}: {
  camper: Camper;
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => camperForm(camper));
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof CamperForm>(key: Key, value: CamperForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/campers/${camper.id}`,
      'PATCH',
      camperUpdatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    const savedCamper = result.campers.find((nextCamper) => nextCamper.id === camper.id);
    if (savedCamper) setForm(camperForm(savedCamper));
    onSaved(result);
    setState({ ...cleanState, message: 'Camper saved.' });
  };

  return (
    <form className="recordPanel" id={`camper-${camper.id}`} onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>
          {camper.first_name} {camper.last_name}
        </strong>
        <span>{roleLabel(camper.adult_id ? 'Adult camper' : 'Camper', camper.birth_date)}</span>
      </div>
      <Message state={state} />
      <CamperRegistrations camper={camper} familyId={familyId} onSaved={onSaved} />
      <CamperFields form={form} state={state} set={set} />
      <div className="inlineActions">
        <button className="buttonSecondary" type="submit" disabled={state.saving}>
          <Save size={17} aria-hidden="true" />
          {state.saving ? 'Saving...' : 'Save camper'}
        </button>
      </div>
    </form>
  );
}

function CamperRegistrations({
  camper,
  familyId,
  onSaved,
}: {
  camper: Camper;
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [state, setState] = useState<SaveState>(cleanState);
  if (camper.registrations.length === 0) return null;

  const cancel = async (registrationId: string) => {
    setState({ ...cleanState, saving: true });
    const result = await postRegistrationOperation(
      `/api/v1/families/${familyId}/registrations/${registrationId}/cancel`,
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result.family);
    setState({ ...cleanState, message: 'Registration cancelled.' });
  };

  return (
    <div className="registrationLinks" aria-label={`${camper.first_name} session registrations`}>
      <Message state={state} />
      <span>Session registrations</span>
      <div>
        {camper.registrations.map((registration) => (
          <div className="registrationLinkRow" key={registration.registration_id}>
            <Link
              className={`registrationLink registrationLink${registration.status.toLowerCase()}`}
              href={`/sessions/${registration.session_id}`}
            >
              <strong>{registration.session_name}</strong>
              <small>
                {registration.status === 'CONFIRMED' ? 'Attending' : 'Waitlisted'} -{' '}
                {registration.source === 'ADMIN' ? 'Admin' : 'Parent'} - {registration.session_code}{' '}
                - {new Date(registration.registered_at).toLocaleDateString('en-US')}
              </small>
            </Link>
            <button
              className="iconButton dangerButton"
              type="button"
              disabled={state.saving}
              onClick={() => void cancel(registration.registration_id)}
              title="Cancel registration"
              aria-label={`Cancel ${registration.session_name} registration`}
            >
              <XCircle size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSessionOption(session: SessionSummary): string {
  return `${session.name} - ${session.code} - ${session.registered_count}/${session.capacity} registered, ${session.waitlisted_count} waitlisted`;
}

function registrationMessage(registration: FamilyRegistrationResult['registration']): string {
  return registration.status === 'CONFIRMED'
    ? 'Registration confirmed.'
    : 'Camper added to the waitlist.';
}

function AdminRegistrationPanel({
  family,
  onSaved,
  sessions,
}: {
  family: FamilyDetail;
  onSaved: (family: FamilyDetail) => void;
  sessions: SessionSummary[];
}) {
  const sessionOptions = sessions.filter(
    (session) => session.status !== 'CANCELLED' && session.status !== 'ARCHIVED',
  );
  const [camperId, setCamperId] = useState(family.campers[0]?.id ?? '');
  const [sessionId, setSessionId] = useState(sessionOptions[0]?.id ?? '');
  const [state, setState] = useState<SaveState>(cleanState);

  useEffect(() => {
    if (!camperId && family.campers[0]) setCamperId(family.campers[0].id);
    if (!sessionId && sessionOptions[0]) setSessionId(sessionOptions[0].id);
  }, [camperId, family.campers, sessionId, sessionOptions]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const payload: FamilyRegistrationCreate = {
      camper_id: camperId,
      session_id: sessionId,
      source: 'ADMIN',
    };
    const result = await writeRegistration(`/api/v1/families/${family.id}/registrations`, payload);
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result.family);
    setState({ ...cleanState, message: registrationMessage(result.registration) });
  };

  return (
    <form className="recordPanel registrationPanel" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>Register camper</strong>
        <span>Admin</span>
      </div>
      <Message state={state} />
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
            {family.campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                {camper.first_name} {camper.last_name}
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
            {sessionOptions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionOption(session)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="inlineActions">
        <button
          className="buttonPrimary"
          type="submit"
          disabled={state.saving || family.campers.length === 0 || sessionOptions.length === 0}
        >
          <Plus size={17} aria-hidden="true" />
          {state.saving ? 'Registering...' : 'Register camper'}
        </button>
      </div>
    </form>
  );
}

function CamperCreatePanel({
  familyId,
  onSaved,
}: {
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => camperForm());
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof CamperForm>(key: Key, value: CamperForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/campers`,
      'POST',
      camperCreatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setForm(camperForm());
    setState({ ...cleanState, message: 'Camper added.' });
  };

  return (
    <form className="recordPanel recordPanelNew" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>Add camper</strong>
        <span>Participant</span>
      </div>
      <Message state={state} />
      <CamperFields form={form} state={state} set={set} />
      <div className="inlineActions">
        <button className="buttonPrimary" type="submit" disabled={state.saving}>
          <Plus size={17} aria-hidden="true" />
          {state.saving ? 'Adding...' : 'Add camper'}
        </button>
      </div>
    </form>
  );
}

interface ContactForm {
  authorized_pickup: boolean;
  birth_date: string;
  email: string;
  emergency_contact: boolean;
  emergency_priority: string;
  first_name: string;
  last_name: string;
  phone: string;
  receives_operational_communication: boolean;
  relationship: string;
  version: number;
}

function contactForm(contact?: Contact): ContactForm {
  return {
    authorized_pickup: contact?.authorized_pickup ?? true,
    birth_date: contact?.birth_date ?? '',
    email: contact?.email ?? '',
    emergency_contact: contact?.emergency_contact ?? true,
    emergency_priority: contact?.emergency_priority ? String(contact.emergency_priority) : '',
    first_name: contact?.first_name ?? '',
    last_name: contact?.last_name ?? '',
    phone: contact?.phone ?? '',
    receives_operational_communication: contact?.receives_operational_communication ?? false,
    relationship: contact?.relationship ?? '',
    version: contact?.version ?? 1,
  };
}

function contactCreatePayload(form: ContactForm): ContactCreate {
  return {
    authorized_pickup: form.authorized_pickup,
    birth_date: nullable(form.birth_date),
    email: nullable(form.email),
    emergency_contact: form.emergency_contact,
    emergency_priority: form.emergency_priority ? Number(form.emergency_priority) : null,
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone: form.phone.trim(),
    receives_operational_communication: form.receives_operational_communication,
    relationship: form.relationship.trim(),
  };
}

function contactUpdatePayload(form: ContactForm): ContactUpdate {
  return { ...contactCreatePayload(form), version: form.version };
}

function ContactFields({
  form,
  state,
  set,
}: {
  form: ContactForm;
  state: SaveState;
  set: <Key extends keyof ContactForm>(key: Key, value: ContactForm[Key]) => void;
}) {
  return (
    <>
      <div className="fieldGrid">
        <Field label="First name" error={state.fieldErrors.first_name}>
          <input
            value={form.first_name}
            onChange={(event) => set('first_name', event.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Last name" error={state.fieldErrors.last_name}>
          <input
            value={form.last_name}
            onChange={(event) => set('last_name', event.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Birth date" error={state.fieldErrors.birth_date}>
          <input
            type="date"
            value={form.birth_date}
            onChange={(event) => set('birth_date', event.target.value)}
          />
        </Field>
        <Field label="Email" error={state.fieldErrors.email}>
          <input
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            inputMode="email"
            maxLength={254}
          />
        </Field>
        <Field label="Phone" error={state.fieldErrors.phone}>
          <input
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            maxLength={40}
            required
          />
        </Field>
        <Field label="Relationship" error={state.fieldErrors.relationship}>
          <input
            value={form.relationship}
            onChange={(event) => set('relationship', event.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label="Emergency priority" error={state.fieldErrors.emergency_priority}>
          <input
            value={form.emergency_priority}
            onChange={(event) => set('emergency_priority', event.target.value)}
            min="1"
            type="number"
          />
        </Field>
      </div>
      <ContactRoleToggles form={form} set={set} />
      {state.fieldErrors.roles && (
        <small className="formErrorText">{state.fieldErrors.roles}</small>
      )}
    </>
  );
}

function ContactEditor({
  contact,
  familyId,
  onSaved,
}: {
  contact: Contact;
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => contactForm(contact));
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof ContactForm>(key: Key, value: ContactForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/contacts/${contact.id}`,
      'PATCH',
      contactUpdatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    const savedContact = result.contacts.find((nextContact) => nextContact.id === contact.id);
    if (savedContact) setForm(contactForm(savedContact));
    onSaved(result);
    setState({ ...cleanState, message: 'Contact saved.' });
  };

  return (
    <form className="recordPanel" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>
          {contact.first_name} {contact.last_name}
        </strong>
        <span>{roleLabel('Contact', contact.birth_date)}</span>
      </div>
      <Message state={state} />
      <ContactFields form={form} state={state} set={set} />
      <div className="inlineActions">
        <button className="buttonSecondary" type="submit" disabled={state.saving}>
          <Save size={17} aria-hidden="true" />
          {state.saving ? 'Saving...' : 'Save contact'}
        </button>
      </div>
    </form>
  );
}

function ContactCreatePanel({
  familyId,
  onSaved,
}: {
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => contactForm());
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof ContactForm>(key: Key, value: ContactForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await writeFamily(
      `/api/v1/families/${familyId}/contacts`,
      'POST',
      contactCreatePayload(form),
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setForm(contactForm());
    setState({ ...cleanState, message: 'Contact added.' });
  };

  return (
    <form className="recordPanel recordPanelNew" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>Add contact</strong>
        <span>Emergency or pickup</span>
      </div>
      <Message state={state} />
      <ContactFields form={form} state={state} set={set} />
      <div className="inlineActions">
        <button className="buttonPrimary" type="submit" disabled={state.saving}>
          <Plus size={17} aria-hidden="true" />
          {state.saving ? 'Adding...' : 'Add contact'}
        </button>
      </div>
    </form>
  );
}

async function writeFamily(
  path: string,
  method: 'PATCH' | 'POST',
  payload:
    | AdultCreate
    | AdultUpdate
    | CamperCreate
    | CamperUpdate
    | ContactCreate
    | ContactUpdate
    | FamilyUpdate,
): Promise<FamilyDetail | ProblemResponse> {
  try {
    const response = await fetch(path, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method,
    });
    return (await response.json()) as FamilyDetail | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The family record could not be saved.' };
  }
}

async function writeRegistration(
  path: string,
  payload: FamilyRegistrationCreate,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(path, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The camper could not be registered.' };
  }
}

async function postRegistrationOperation(
  path: string,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(path, { method: 'POST' });
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The registration could not be updated.' };
  }
}
