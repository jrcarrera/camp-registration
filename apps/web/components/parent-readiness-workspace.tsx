'use client';

import type {
  Camper,
  CamperUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  FamilyDetail,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface ParentReadinessWorkspaceProps {
  initialFamilies: FamilyDetail[];
  requestHeaders: Record<string, string>;
}

interface WorkspaceState {
  message: string | null;
  savingKey: string | null;
  tone: 'error' | 'success';
}

interface SummaryTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

type GenderValue = NonNullable<Camper['gender']>;

interface CamperReadinessForm {
  accessibility_needs: string;
  cabin_preference: string;
  gender: '' | GenderValue;
  preferred_name: string;
  school_grade: string;
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
}

interface ReadinessItem {
  complete: boolean;
  label: string;
}

const cleanState: WorkspaceState = {
  message: null,
  savingKey: null,
  tone: 'success',
};

function fullName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function jsonHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers, 'Content-Type': 'application/json' };
}

function isProblem(value: FamilyDetail | ProblemResponse): value is ProblemResponse {
  return 'code' in value || 'field_errors' in value;
}

function problemMessage(problem: ProblemResponse): WorkspaceState {
  return {
    message: problem.message,
    savingKey: null,
    tone: 'error',
  };
}

function emergencyPeople(family: FamilyDetail): number {
  return (
    family.adults.filter((adult) => adult.emergency_contact).length +
    family.contacts.filter((contact) => contact.emergency_contact).length
  );
}

function authorizedPickupPeople(family: FamilyDetail): number {
  return (
    family.adults.filter((adult) => adult.authorized_pickup).length +
    family.contacts.filter((contact) => contact.authorized_pickup).length
  );
}

function camperReadinessItems(family: FamilyDetail, camper: Camper): ReadinessItem[] {
  return [
    {
      complete: Boolean(camper.school_grade?.trim() && camper.gender),
      label: 'Grade and gender are on file',
    },
    {
      complete: Boolean(camper.accessibility_needs?.trim()),
      label: 'Health, allergy, medication, or accessibility notes reviewed',
    },
    {
      complete: emergencyPeople(family) > 0,
      label: 'Emergency contact is available',
    },
    {
      complete: authorizedPickupPeople(family) > 0,
      label: 'Authorized pickup person is available',
    },
  ];
}

function initialCamperForm(camper: Camper): CamperReadinessForm {
  return {
    accessibility_needs: camper.accessibility_needs ?? '',
    cabin_preference: camper.cabin_preference ?? '',
    gender: camper.gender ?? '',
    preferred_name: camper.preferred_name ?? '',
    school_grade: camper.school_grade ?? '',
  };
}

function initialContactForm(contact?: Contact): ContactForm {
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
  };
}

function camperPayload(camper: Camper, form: CamperReadinessForm): CamperUpdate {
  return {
    adult_id: camper.adult_id,
    birth_date: camper.birth_date,
    email: camper.email,
    first_name: camper.first_name,
    gender: form.gender || null,
    last_name: camper.last_name,
    preferred_name: nullable(form.preferred_name),
    school_grade: nullable(form.school_grade),
    cabin_preference: nullable(form.cabin_preference),
    accessibility_needs: nullable(form.accessibility_needs),
    version: camper.version,
  };
}

function contactPayload(form: ContactForm, version?: number): ContactCreate | ContactUpdate {
  const priority =
    form.emergency_contact && form.emergency_priority.trim()
      ? Number(form.emergency_priority)
      : null;
  const payload = {
    authorized_pickup: form.authorized_pickup,
    birth_date: nullable(form.birth_date),
    email: nullable(form.email),
    emergency_contact: form.emergency_contact,
    emergency_priority: Number.isFinite(priority) ? priority : null,
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone: form.phone.trim(),
    receives_operational_communication: form.receives_operational_communication,
    relationship: form.relationship.trim(),
  };
  return version ? { ...payload, version } : payload;
}

async function saveCamperReadiness(
  familyId: string,
  camper: Camper,
  form: CamperReadinessForm,
  requestHeaders: Record<string, string>,
): Promise<FamilyDetail | ProblemResponse> {
  try {
    const response = await fetch(`/api/v1/families/${familyId}/campers/${camper.id}`, {
      body: JSON.stringify(camperPayload(camper, form)),
      headers: jsonHeaders(requestHeaders),
      method: 'PATCH',
    });
    return (await response.json()) as FamilyDetail | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'Camper readiness could not be saved.' };
  }
}

async function saveContact(
  familyId: string,
  form: ContactForm,
  requestHeaders: Record<string, string>,
  contact?: Contact,
): Promise<FamilyDetail | ProblemResponse> {
  const endpoint = contact
    ? `/api/v1/families/${familyId}/contacts/${contact.id}`
    : `/api/v1/families/${familyId}/contacts`;
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify(contactPayload(form, contact?.version)),
      headers: jsonHeaders(requestHeaders),
      method: contact ? 'PATCH' : 'POST',
    });
    return (await response.json()) as FamilyDetail | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'Contact details could not be saved.' };
  }
}

function SummaryTile({ icon: Icon, label, value }: SummaryTileProps) {
  return (
    <div className="portalSummaryTile">
      <span aria-hidden="true">
        <Icon size={18} />
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function WorkspaceMessage({ state }: { state: WorkspaceState }) {
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

function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  return (
    <div className="readinessChecklist" aria-label="Readiness checklist">
      {items.map((item) => (
        <div
          className={`readinessCheckItem${item.complete ? ' readinessCheckComplete' : ''}`}
          key={item.label}
        >
          {item.complete ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function CamperReadinessCard({
  camper,
  family,
  onSaved,
  requestHeaders,
  savingKey,
  setState,
}: {
  camper: Camper;
  family: FamilyDetail;
  onSaved: (family: FamilyDetail) => void;
  requestHeaders: Record<string, string>;
  savingKey: string | null;
  setState: (state: WorkspaceState) => void;
}) {
  const [form, setForm] = useState(() => initialCamperForm(camper));
  const items = camperReadinessItems(family, camper);
  const openItems = items.filter((item) => !item.complete).length;
  const saving = savingKey === `camper:${camper.id}`;

  const setField = (field: keyof CamperReadinessForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ message: null, savingKey: `camper:${camper.id}`, tone: 'success' });
    const result = await saveCamperReadiness(family.id, camper, form, requestHeaders);
    if (isProblem(result)) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    setState({
      message: `${fullName(camper)} readiness details saved.`,
      savingKey: null,
      tone: 'success',
    });
  };

  return (
    <article
      className="readinessCamperCard"
      aria-label={`Readiness for ${fullName(camper)}`}
      data-testid={`camper-readiness-${camper.id}`}
    >
      <div className="readinessCardHeader">
        <span className="portalAvatar" aria-hidden="true">
          <UserRound size={19} />
        </span>
        <div>
          <h3>{fullName(camper)}</h3>
          <p>{openItems === 0 ? 'Ready for camp' : `${openItems} readiness items need review`}</p>
        </div>
        <span className={`statusBadge ${openItems === 0 ? 'statusconfirmed' : 'statuswaitlisted'}`}>
          {openItems === 0 ? 'Ready' : 'Review'}
        </span>
      </div>

      <ReadinessChecklist items={items} />

      <form className="readinessForm" onSubmit={handleSubmit}>
        <div className="fieldGrid">
          <label className="formField">
            Preferred name
            <input
              value={form.preferred_name}
              onChange={(event) => setField('preferred_name', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="formField">
            School grade
            <input
              value={form.school_grade}
              onChange={(event) => setField('school_grade', event.target.value)}
              maxLength={40}
            />
          </label>
          <label className="formField">
            Gender
            <select
              value={form.gender}
              onChange={(event) => setField('gender', event.target.value)}
            >
              <option value="">Select</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </label>
          <label className="formField">
            Cabin or group request
            <input
              value={form.cabin_preference}
              onChange={(event) => setField('cabin_preference', event.target.value)}
              maxLength={160}
            />
          </label>
          <label className="formField fieldWide">
            Health, allergies, medication, or accessibility notes
            <textarea
              value={form.accessibility_needs}
              onChange={(event) => setField('accessibility_needs', event.target.value)}
              maxLength={500}
              placeholder="Enter notes or type None."
            />
          </label>
        </div>
        <div className="inlineActions">
          <button className="buttonPrimary" type="submit" disabled={saving || savingKey !== null}>
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving...' : 'Save readiness'}
          </button>
        </div>
      </form>
    </article>
  );
}

function ContactEditor({
  contact,
  familyId,
  onSaved,
  requestHeaders,
  savingKey,
  setState,
}: {
  contact?: Contact;
  familyId: string;
  onSaved: (family: FamilyDetail) => void;
  requestHeaders: Record<string, string>;
  savingKey: string | null;
  setState: (state: WorkspaceState) => void;
}) {
  const [form, setForm] = useState(() => initialContactForm(contact));
  const savingId = contact ? `contact:${contact.id}` : `contact:new:${familyId}`;
  const saving = savingKey === savingId;

  const setField = (field: keyof ContactForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ message: null, savingKey: savingId, tone: 'success' });
    const result = await saveContact(familyId, form, requestHeaders, contact);
    if (isProblem(result)) {
      setState(problemMessage(result));
      return;
    }
    onSaved(result);
    if (!contact) setForm(initialContactForm());
    setState({
      message: contact ? `${fullName(contact)} contact details saved.` : 'Contact added.',
      savingKey: null,
      tone: 'success',
    });
  };

  return (
    <details
      className="readinessContactEditor"
      data-testid={contact ? `contact-editor-${contact.id}` : `contact-editor-new-${familyId}`}
      open={!contact}
    >
      <summary>
        {contact ? (
          <>
            <Pencil size={15} aria-hidden="true" />
            Edit {fullName(contact)}
          </>
        ) : (
          <>
            <Plus size={15} aria-hidden="true" />
            Add emergency or pickup contact
          </>
        )}
      </summary>
      <form className="readinessForm" onSubmit={handleSubmit}>
        <div className="fieldGrid">
          <label className="formField">
            First name
            <input
              required
              value={form.first_name}
              onChange={(event) => setField('first_name', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="formField">
            Last name
            <input
              required
              value={form.last_name}
              onChange={(event) => setField('last_name', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="formField">
            Phone
            <input
              required
              value={form.phone}
              onChange={(event) => setField('phone', event.target.value)}
              maxLength={40}
            />
          </label>
          <label className="formField">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              maxLength={254}
            />
          </label>
          <label className="formField">
            Relationship
            <input
              required
              value={form.relationship}
              onChange={(event) => setField('relationship', event.target.value)}
              maxLength={80}
            />
          </label>
          <label className="formField">
            Emergency priority
            <input
              type="number"
              min={1}
              value={form.emergency_priority}
              onChange={(event) => setField('emergency_priority', event.target.value)}
              disabled={!form.emergency_contact}
            />
          </label>
        </div>
        <div className="toggleGrid">
          <label className="checkField">
            <input
              type="checkbox"
              checked={form.emergency_contact}
              onChange={(event) => setField('emergency_contact', event.target.checked)}
            />
            Emergency contact
          </label>
          <label className="checkField">
            <input
              type="checkbox"
              checked={form.authorized_pickup}
              onChange={(event) => setField('authorized_pickup', event.target.checked)}
            />
            Authorized pickup
          </label>
          <label className="checkField">
            <input
              type="checkbox"
              checked={form.receives_operational_communication}
              onChange={(event) =>
                setField('receives_operational_communication', event.target.checked)
              }
            />
            Operational messages
          </label>
        </div>
        <div className="inlineActions">
          <button className="buttonPrimary" type="submit" disabled={saving || savingKey !== null}>
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving...' : contact ? 'Save contact' : 'Add contact'}
          </button>
        </div>
      </form>
    </details>
  );
}

function ContactReadinessPanel({
  family,
  onSaved,
  requestHeaders,
  savingKey,
  setState,
}: {
  family: FamilyDetail;
  onSaved: (family: FamilyDetail) => void;
  requestHeaders: Record<string, string>;
  savingKey: string | null;
  setState: (state: WorkspaceState) => void;
}) {
  return (
    <aside className="readinessContactPanel" aria-label={`${family.family_name} contacts`}>
      <div className="readinessPanelHeader">
        <span aria-hidden="true">
          <Phone size={18} />
        </span>
        <div>
          <strong>Pickup and emergency contacts</strong>
          <small>
            {emergencyPeople(family)} emergency - {authorizedPickupPeople(family)} pickup
          </small>
        </div>
      </div>

      <div className="readinessContactStack">
        {family.contacts.map((contact) => (
          <ContactEditor
            contact={contact}
            familyId={family.id}
            key={contact.id}
            onSaved={onSaved}
            requestHeaders={requestHeaders}
            savingKey={savingKey}
            setState={setState}
          />
        ))}
        <ContactEditor
          familyId={family.id}
          onSaved={onSaved}
          requestHeaders={requestHeaders}
          savingKey={savingKey}
          setState={setState}
        />
      </div>
    </aside>
  );
}

function FamilyReadinessSection({
  family,
  onSaved,
  requestHeaders,
  savingKey,
  setState,
}: {
  family: FamilyDetail;
  onSaved: (family: FamilyDetail) => void;
  requestHeaders: Record<string, string>;
  savingKey: string | null;
  setState: (state: WorkspaceState) => void;
}) {
  return (
    <section
      className="contentSection readinessFamilySection"
      aria-labelledby={`ready-${family.id}`}
    >
      <div className="sectionHeading">
        <div>
          <h2 id={`ready-${family.id}`}>{family.family_name}</h2>
          <p className="sectionDescription">
            Review camper profile details and the people staff can call or release campers to.
          </p>
        </div>
      </div>

      <div className="readinessLayout">
        <div className="readinessCamperStack">
          {family.campers.map((camper) => (
            <CamperReadinessCard
              camper={camper}
              family={family}
              key={camper.id}
              onSaved={onSaved}
              requestHeaders={requestHeaders}
              savingKey={savingKey}
              setState={setState}
            />
          ))}
        </div>
        <ContactReadinessPanel
          family={family}
          onSaved={onSaved}
          requestHeaders={requestHeaders}
          savingKey={savingKey}
          setState={setState}
        />
      </div>
    </section>
  );
}

export function ParentReadinessWorkspace({
  initialFamilies,
  requestHeaders,
}: ParentReadinessWorkspaceProps) {
  const [families, setFamilies] = useState(initialFamilies);
  const [state, setState] = useState<WorkspaceState>(cleanState);
  const summary = useMemo(() => {
    const campers = families.flatMap((family) =>
      family.campers.map((camper) => ({
        camper,
        family,
        items: camperReadinessItems(family, camper),
      })),
    );
    const openItems = campers.reduce(
      (total, item) => total + item.items.filter((readiness) => !readiness.complete).length,
      0,
    );
    return {
      authorizedPickup: families.reduce(
        (total, family) => total + authorizedPickupPeople(family),
        0,
      ),
      emergency: families.reduce((total, family) => total + emergencyPeople(family), 0),
      openItems,
      readyCampers: campers.filter((item) => item.items.every((readiness) => readiness.complete))
        .length,
      totalCampers: campers.length,
    };
  }, [families]);

  const handleFamilySaved = (family: FamilyDetail) => {
    setFamilies((current) =>
      current.map((candidate) => (candidate.id === family.id ? family : candidate)),
    );
  };

  return (
    <>
      <div className="portalSummaryGrid" aria-label="Camp readiness summary">
        <SummaryTile icon={ShieldCheck} label="Ready campers" value={`${summary.readyCampers}`} />
        <SummaryTile
          icon={AlertCircle}
          label="Open readiness items"
          value={`${summary.openItems}`}
        />
        <SummaryTile
          icon={UserCheck}
          label="Authorized pickup people"
          value={`${summary.authorizedPickup}`}
        />
        <SummaryTile icon={HeartPulse} label="Emergency contacts" value={`${summary.emergency}`} />
      </div>

      <div className="portalActionBand">
        <div>
          <Users size={19} aria-hidden="true" />
          <div>
            <strong>
              {summary.openItems === 0
                ? 'Every camper is ready for camp'
                : `${summary.openItems} readiness items to review`}
            </strong>
            <span>
              Complete camper profile, health notes, emergency contacts, and pickup permissions
              before arrival.
            </span>
          </div>
        </div>
      </div>

      <WorkspaceMessage state={state} />

      {families.map((family) => (
        <FamilyReadinessSection
          family={family}
          key={family.id}
          onSaved={handleFamilySaved}
          requestHeaders={requestHeaders}
          savingKey={state.savingKey}
          setState={setState}
        />
      ))}
    </>
  );
}
