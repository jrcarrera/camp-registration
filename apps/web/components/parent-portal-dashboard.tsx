'use client';

import type {
  Adult,
  Camper,
  CamperSessionRegistration,
  Contact,
  FamilyDetail,
  FamilyRegistrationResult,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface ParentPortalDashboardProps {
  initialFamilies: FamilyDetail[];
  requestHeaders: Record<string, string>;
}

interface PortalState {
  message: string | null;
  savingRegistrationId: string | null;
  tone: 'error' | 'success';
}

interface RegistrationItem {
  camper: Camper;
  family: FamilyDetail;
  registration: CamperSessionRegistration;
}

const cleanState: PortalState = {
  message: null,
  savingRegistrationId: null,
  tone: 'success',
};

function present<T>(value: T | false | null | undefined): value is T {
  return Boolean(value);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ageToday(birthDate: string): number | null {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const today = new Date();
  if (Number.isNaN(birth.valueOf())) return null;
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) {
    years -= 1;
  }
  return years;
}

function fullName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`;
}

function statusLabel(status: CamperSessionRegistration['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function registrationIcon(status: CamperSessionRegistration['status']): LucideIcon {
  return status === 'WAITLISTED' ? Clock3 : CheckCircle2;
}

function activeRegistrations(camper: Camper): CamperSessionRegistration[] {
  return camper.registrations
    .filter((registration) => registration.status !== 'CANCELLED')
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

function registrationItems(families: FamilyDetail[]): RegistrationItem[] {
  return families
    .flatMap((family) =>
      family.campers.flatMap((camper) =>
        activeRegistrations(camper).map((registration) => ({ camper, family, registration })),
      ),
    )
    .sort((a, b) => a.registration.starts_on.localeCompare(b.registration.starts_on));
}

function countWaitlisted(items: RegistrationItem[]): number {
  return items.filter((item) => item.registration.status === 'WAITLISTED').length;
}

function countEmergencyPeople(families: FamilyDetail[]): number {
  return families.reduce(
    (total, family) =>
      total +
      family.adults.filter((adult) => adult.emergency_contact).length +
      family.contacts.filter((contact) => contact.emergency_contact).length,
    0,
  );
}

function findPrimaryAdult(family: FamilyDetail): Adult | null {
  return (
    family.adults.find((adult) => adult.account_owner) ??
    family.adults.find((adult) => adult.can_register) ??
    family.adults[0] ??
    null
  );
}

function personContactLine(person: Adult | Contact): string {
  const parts = ['email' in person && person.email ? person.email : null, person.phone].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(' - ') : 'No contact details on file';
}

function problemMessage(problem: ProblemResponse): PortalState {
  return {
    message: problem.message,
    savingRegistrationId: null,
    tone: 'error',
  };
}

async function cancelRegistration(
  familyId: string,
  registrationId: string,
  requestHeaders: Record<string, string>,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(
      `/api/v1/families/${familyId}/registrations/${registrationId}/cancel`,
      {
        headers: requestHeaders,
        method: 'POST',
      },
    );
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The registration could not be cancelled.' };
  }
}

function PortalMessage({ state }: { state: PortalState }) {
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

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
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

function RegistrationPlan({
  items,
  onCancel,
  savingRegistrationId,
}: {
  items: RegistrationItem[];
  onCancel: (item: RegistrationItem) => void;
  savingRegistrationId: string | null;
}) {
  return (
    <section className="contentSection portalPlanSection" aria-labelledby="portal-plan-heading">
      <div className="sectionHeading">
        <div>
          <h2 id="portal-plan-heading">Camp plan</h2>
          <p className="sectionDescription">
            Upcoming registrations and waitlist spots for your household.
          </p>
        </div>
        <Link className="buttonPrimary" href="/portal/register">
          <Plus size={17} aria-hidden="true" />
          Register for camp
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="portalPlanList">
          {items.map((item) => {
            const { camper, family, registration } = item;
            const Icon = registrationIcon(registration.status);
            const saving = savingRegistrationId === registration.registration_id;
            return (
              <article
                className="portalPlanItem"
                key={registration.registration_id}
                aria-label={`${registration.session_name} for ${fullName(camper)}`}
              >
                <span className="portalPlanIcon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="portalPlanContent">
                  <div>
                    <strong>{registration.session_name}</strong>
                    <span>
                      {fullName(camper)} - {registration.program_name} -{' '}
                      {formatDate(registration.starts_on)}-{formatDate(registration.ends_on)}
                    </span>
                  </div>
                  <div className="portalPlanMeta">
                    <span className={`statusBadge status${registration.status.toLowerCase()}`}>
                      {statusLabel(registration.status)}
                    </span>
                    <span>{family.family_name}</span>
                    <span>Added {formatTimestamp(registration.registered_at)}</span>
                  </div>
                </div>
                <button
                  className="buttonSecondary dangerInlineButton"
                  type="button"
                  disabled={savingRegistrationId !== null}
                  onClick={() => onCancel(item)}
                  title={`Cancel ${registration.session_name}`}
                >
                  <XCircle size={17} aria-hidden="true" />
                  {saving ? 'Cancelling...' : 'Cancel'}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="portalEmptyPlan">
          <CalendarDays size={20} aria-hidden="true" />
          <div>
            <strong>No active registrations yet</strong>
            <span>Choose a camper and session when you are ready to register.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function CamperCard({ camper }: { camper: Camper }) {
  const registrations = activeRegistrations(camper);
  const age = ageToday(camper.birth_date);

  return (
    <article className="portalCamperCard" id={`camper-${camper.id}`}>
      <div className="portalCamperHeader">
        <span className="portalAvatar" aria-hidden="true">
          <UserRound size={19} />
        </span>
        <div>
          <h3>
            {camper.first_name} {camper.last_name}
          </h3>
          <p>
            {age === null ? 'Age not available' : `${age} years old`}
            {camper.school_grade ? ` - Grade ${camper.school_grade}` : ''}
          </p>
        </div>
      </div>

      <div className="portalRegistrationStack">
        {registrations.length > 0 ? (
          registrations.map((registration) => {
            const Icon = registrationIcon(registration.status);
            return (
              <div className="portalRegistrationRow" key={registration.registration_id}>
                <Icon size={17} aria-hidden="true" />
                <div>
                  <strong>{registration.session_name}</strong>
                  <span>
                    {registration.program_name} - {formatDate(registration.starts_on)}-
                    {formatDate(registration.ends_on)}
                  </span>
                </div>
                <span className={`statusBadge status${registration.status.toLowerCase()}`}>
                  {statusLabel(registration.status)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="portalEmptyRegistration">
            <CalendarDays size={17} aria-hidden="true" />
            <span>No active registrations or waitlist spots.</span>
          </div>
        )}
      </div>

      <div className="portalCardActions">
        <Link className="buttonSecondary" href={`/portal/register?camperId=${camper.id}`}>
          Register
        </Link>
      </div>
    </article>
  );
}

function AdultSummary({ adult }: { adult: Adult }) {
  const badges = [
    adult.account_owner ? 'Owner' : null,
    adult.can_register ? 'Registration' : null,
    adult.emergency_contact ? 'Emergency' : null,
    adult.authorized_pickup ? 'Pickup' : null,
  ].filter(present);

  return (
    <article className="portalPersonCard">
      <div>
        <strong>{fullName(adult)}</strong>
        <span>{personContactLine(adult)}</span>
      </div>
      <div className="portalBadgeRow">
        {badges.map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
      </div>
    </article>
  );
}

function ContactSummary({ contact }: { contact: Contact }) {
  const badges = [
    contact.relationship,
    contact.emergency_contact ? `Emergency ${contact.emergency_priority ?? ''}`.trim() : null,
    contact.authorized_pickup ? 'Pickup' : null,
  ].filter(present);

  return (
    <article className="portalPersonCard">
      <div>
        <strong>{fullName(contact)}</strong>
        <span>{personContactLine(contact)}</span>
      </div>
      <div className="portalBadgeRow">
        {badges.map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
      </div>
    </article>
  );
}

function FamilyPanel({ family }: { family: FamilyDetail }) {
  const activeRegistrationCount = family.campers.reduce(
    (total, camper) => total + activeRegistrations(camper).length,
    0,
  );
  const primaryAdult = findPrimaryAdult(family);

  return (
    <section className="contentSection portalFamilySection" aria-labelledby={`family-${family.id}`}>
      <div className="sectionHeading">
        <div>
          <h2 id={`family-${family.id}`}>{family.family_name}</h2>
          <p className="sectionDescription">
            {family.camper_count} campers - {activeRegistrationCount} current registrations or
            waitlist spots
          </p>
        </div>
      </div>

      <div className="portalFamilyLayout">
        <div>
          <h3 className="portalSubheading">Campers</h3>
          <div className="portalCamperGrid">
            {family.campers.map((camper) => (
              <CamperCard camper={camper} key={camper.id} />
            ))}
          </div>
        </div>

        <aside className="portalProfilePanel" aria-label={`${family.family_name} profile`}>
          <div className="portalProfileSummary">
            <span aria-hidden="true">
              <Users size={19} />
            </span>
            <div>
              <strong>{primaryAdult ? fullName(primaryAdult) : 'No primary adult'}</strong>
              <small>Primary household contact</small>
            </div>
          </div>

          <div className="portalProfileGroup">
            <h3>Adults</h3>
            <div>
              {family.adults.map((adult) => (
                <AdultSummary adult={adult} key={adult.id} />
              ))}
            </div>
          </div>

          <div className="portalProfileGroup">
            <h3>Emergency contacts</h3>
            <div>
              {family.contacts.length > 0 ? (
                family.contacts.map((contact) => (
                  <ContactSummary contact={contact} key={contact.id} />
                ))
              ) : (
                <p>No emergency contacts on file.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function ParentPortalDashboard({
  initialFamilies,
  requestHeaders,
}: ParentPortalDashboardProps) {
  const [families, setFamilies] = useState(initialFamilies);
  const [state, setState] = useState<PortalState>(cleanState);
  const items = useMemo(() => registrationItems(families), [families]);
  const camperCount = families.reduce((total, family) => total + family.camper_count, 0);
  const emergencyPeople = countEmergencyPeople(families);
  const waitlistedCount = countWaitlisted(items);

  const handleCancel = async (item: RegistrationItem) => {
    const { camper, family, registration } = item;
    const confirmed = window.confirm(
      `Cancel ${registration.session_name} for ${fullName(camper)}?`,
    );
    if (!confirmed) return;

    setState({
      message: null,
      savingRegistrationId: registration.registration_id,
      tone: 'success',
    });
    const result = await cancelRegistration(
      family.id,
      registration.registration_id,
      requestHeaders,
    );
    if ('field_errors' in result || 'code' in result) {
      setState(problemMessage(result));
      return;
    }

    setFamilies((current) =>
      current.map((candidate) => (candidate.id === result.family.id ? result.family : candidate)),
    );
    setState({
      message: `${registration.session_name} registration cancelled for ${fullName(camper)}.`,
      savingRegistrationId: null,
      tone: 'success',
    });
  };

  return (
    <>
      <div className="portalSummaryGrid" aria-label="Family registration summary">
        <SummaryTile icon={Users} label="Linked family accounts" value={String(families.length)} />
        <SummaryTile
          icon={UserRound}
          label="Campers in your household"
          value={String(camperCount)}
        />
        <SummaryTile
          icon={CalendarDays}
          label="Current registrations"
          value={String(items.length)}
        />
        <SummaryTile icon={HeartPulse} label="Emergency contacts" value={String(emergencyPeople)} />
      </div>

      <div className="portalActionBand">
        <div>
          <ShieldCheck size={19} aria-hidden="true" />
          <div>
            <strong>
              {waitlistedCount > 0 ? `${waitlistedCount} waitlist spots` : 'Ready for camp'}
            </strong>
            <span>
              Your household details and camp plan are collected here so parents do not need the
              staff workspace.
            </span>
          </div>
        </div>
        <Link className="buttonSecondary" href="/portal/register">
          <Plus size={17} aria-hidden="true" />
          Add registration
        </Link>
      </div>

      <PortalMessage state={state} />
      <RegistrationPlan
        items={items}
        onCancel={handleCancel}
        savingRegistrationId={state.savingRegistrationId}
      />

      {families.map((family) => (
        <FamilyPanel family={family} key={family.id} />
      ))}
    </>
  );
}
