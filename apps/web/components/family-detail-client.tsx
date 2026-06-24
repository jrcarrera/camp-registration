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
  FamilyUpdate,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Plus, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';

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
}

export function FamilyDetailClient({ initialFamily }: FamilyDetailClientProps) {
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
          {family.adults.map((adult) => (
            <AdultEditor key={adult.id} adult={adult} familyId={family.id} onSaved={saveFamily} />
          ))}
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
  onSaved,
}: {
  adult: Adult;
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
}) {
  const [form, setForm] = useState(() => adultForm(adult));
  const [state, setState] = useState<SaveState>(cleanState);
  const set = <Key extends keyof AdultForm>(key: Key, value: AdultForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setState(cleanState);
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
        <span>{adult.account_owner ? 'Owner' : 'Adult'}</span>
      </div>
      <Message state={state} />
      <AdultFields form={form} state={state} set={set} />
      <div className="inlineActions">
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
  birth_date: string;
  cabin_preference: string;
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
    birth_date: camper?.birth_date ?? '',
    cabin_preference: camper?.cabin_preference ?? '',
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
    birth_date: form.birth_date,
    cabin_preference: nullable(form.cabin_preference),
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
    <form className="recordPanel" onSubmit={submit}>
      <div className="recordPanelHeader">
        <strong>
          {camper.first_name} {camper.last_name}
        </strong>
        <span>Camper</span>
      </div>
      <Message state={state} />
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
        <span>Contact</span>
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
