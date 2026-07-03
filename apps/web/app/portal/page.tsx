import type { Camper, CamperSessionRegistration, FamilyDetail } from '@camp-registration/contracts';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Plus, UserRound } from 'lucide-react';
import Link from 'next/link';

import { getParentApiHeaders, getParentFamilies, getParentFamily } from '../../lib/api';

export const dynamic = 'force-dynamic';

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
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

function statusLabel(status: CamperSessionRegistration['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function registrationIcon(status: CamperSessionRegistration['status']) {
  return status === 'WAITLISTED' ? Clock3 : CheckCircle2;
}

function activeRegistrations(camper: Camper): CamperSessionRegistration[] {
  return camper.registrations
    .filter((registration) => registration.status !== 'CANCELLED')
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
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

function FamilyPanel({ family }: { family: FamilyDetail }) {
  const activeRegistrationCount = family.campers.reduce(
    (total, camper) => total + activeRegistrations(camper).length,
    0,
  );

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
        <Link className="buttonPrimary" href="/portal/register">
          <Plus size={17} aria-hidden="true" />
          Register for camp
        </Link>
      </div>

      <div className="portalCamperGrid">
        {family.campers.map((camper) => (
          <CamperCard camper={camper} key={camper.id} />
        ))}
      </div>
    </section>
  );
}

export default async function ParentPortalPage() {
  const parentHeaders = getParentApiHeaders();
  let families: FamilyDetail[] = [];
  let errorMessage: string | null = null;

  try {
    const response = await getParentFamilies(parentHeaders);
    families = await Promise.all(
      response.families.map((family) => getParentFamily(family.id, parentHeaders)),
    );
  } catch {
    errorMessage = 'Your family information could not be loaded.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Parent portal</p>
          <h1>My Family</h1>
          <p className="pageDescription">
            Review your campers, registrations, and waitlist status.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      {!errorMessage && families.length === 0 && (
        <section className="contentSection portalEmptyState" aria-label="No linked family">
          <h2>No linked family account</h2>
          <p>This parent identity is not linked to an adult who can view or manage a family yet.</p>
        </section>
      )}

      {families.map((family) => (
        <FamilyPanel family={family} key={family.id} />
      ))}
    </>
  );
}
