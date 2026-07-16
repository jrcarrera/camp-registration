import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RegisteredCamper } from '@camp-registration/contracts';

import { RegistrationPaymentForm } from '../../../components/registration-payment-form';
import { SessionAttendanceControls } from '../../../components/session-attendance-controls';
import { SessionEditor } from '../../../components/session-editor';
import { WaitlistQueueManager } from '../../../components/waitlist-queue-manager';
import {
  WaitlistOfferButton,
  WaitlistOfferControls,
} from '../../../components/waitlist-offer-button';
import { ApiError, getCatalog, getSession } from '../../../lib/api';

export const dynamic = 'force-dynamic';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function paymentStatusLabel(status: RegisteredCamper['payment_status']): string {
  const labels: Record<RegisteredCamper['payment_status'], string> = {
    DEPOSIT_DUE: 'Deposit due',
    NOT_DUE: 'Not due',
    PAID: 'Paid',
    PARTIAL: 'Partial',
  };
  return labels[status];
}

export default async function SessionEditorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  try {
    const [catalog, session] = await Promise.all([getCatalog(), getSession(sessionId)]);
    const sessionSeason = catalog.seasons.find((season) => season.id === session.season_id);
    return (
      <>
        <Link className="backLink" href="/sessions">
          <ArrowLeft size={16} aria-hidden="true" />
          Sessions
        </Link>
        <header className="editorHeader">
          <div>
            <p className="contextLabel">{session.code}</p>
            <h1>{session.name}</h1>
            <p className="pageDescription">
              Edit week configuration for {sessionSeason?.name ?? 'the selected season'}.
            </p>
          </div>
          <span className={`statusBadge status${session.status.toLowerCase()}`}>
            {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
          </span>
        </header>
        <SessionEditor programs={catalog.programs} seasons={catalog.seasons} session={session} />
        <RegisteredCampers
          availableCount={session.available_count}
          campers={session.registered_campers}
          defaultOfferDurationHours={catalog.organization.waitlist_offer_duration_hours}
          sessionId={session.id}
        />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

function RegisteredCampers({
  availableCount,
  campers,
  defaultOfferDurationHours,
  sessionId,
}: {
  availableCount: number;
  campers: RegisteredCamper[];
  defaultOfferDurationHours: 24 | 48 | 72 | 168;
  sessionId: string;
}) {
  const confirmedCount = campers.filter((camper) => camper.status === 'CONFIRMED').length;
  const waitlistedCampers = campers.filter((camper) => camper.status === 'WAITLISTED');
  const waitlistedCount = waitlistedCampers.length;
  const waitlistQueue = waitlistedCampers.map((camper) => ({
    familyName: camper.family_name,
    hasActiveOffer: camper.waitlist_offer?.status === 'PENDING',
    name: `${camper.preferred_name ?? camper.first_name} ${camper.last_name}`,
    registrationId: camper.registration_id,
  }));

  return (
    <section className="contentSection" id="registered-campers" aria-labelledby="roster-heading">
      <div className="sectionHeading">
        <div>
          <h2 id="roster-heading">Campers</h2>
          <p className="sectionDescription">
            {confirmedCount} attending, {waitlistedCount} waitlisted
          </p>
        </div>
        <div className="sectionActions">
          <Link className="buttonPrimary" href={`/sessions/${sessionId}/check-in`}>
            <ClipboardCheck size={17} aria-hidden="true" />
            Check-in desk
          </Link>
          <WaitlistOfferButton
            defaultExpiresInHours={defaultOfferDurationHours}
            disabled={waitlistedCount === 0 || availableCount === 0}
            sessionId={sessionId}
          />
        </div>
      </div>
      {waitlistQueue.length > 0 && (
        <WaitlistQueueManager campers={waitlistQueue} sessionId={sessionId} />
      )}
      <div className="tableFrame">
        <table className="sessionsTable">
          <thead>
            <tr>
              <th>Camper</th>
              <th>Family</th>
              <th>Gender</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Waitlist offer</th>
              <th>Attendance</th>
              <th>Pickup</th>
              <th>Balance</th>
              <th>Source</th>
              <th>Registered</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {campers.length === 0 ? (
              <tr>
                <td className="emptyState" colSpan={12}>
                  <strong>No campers</strong>
                  <span>Confirmed and waitlisted campers will appear here.</span>
                </td>
              </tr>
            ) : (
              campers.map((camper) => (
                <tr
                  className={camper.status === 'WAITLISTED' ? 'rosterRowWaitlisted' : undefined}
                  key={camper.registration_id}
                >
                  <td>
                    <Link
                      className="sessionLink"
                      href={`/families/${camper.family_id}#camper-${camper.camper_id}`}
                    >
                      <strong>
                        {camper.preferred_name ?? camper.first_name} {camper.last_name}
                      </strong>
                      <span>{camper.birth_date}</span>
                    </Link>
                  </td>
                  <td data-label="Family">{camper.family_name}</td>
                  <td data-label="Gender">{camper.gender ?? 'Not specified'}</td>
                  <td data-label="Grade">{camper.school_grade ?? 'Not set'}</td>
                  <td data-label="Status">
                    <span
                      className={`registrationStatus registrationStatus${camper.status.toLowerCase()}`}
                    >
                      {camper.status === 'CONFIRMED' ? 'Attending' : 'Waitlisted'}
                    </span>
                    {camper.waitlist_position && <span>Queue #{camper.waitlist_position}</span>}
                  </td>
                  <td data-label="Waitlist offer">
                    {camper.waitlist_offer ? (
                      <div className="waitlistOfferCell">
                        <span>
                          {camper.waitlist_offer.status === 'PENDING'
                            ? `Expires ${new Date(camper.waitlist_offer.expires_at).toLocaleString(
                                'en-US',
                              )}`
                            : camper.waitlist_offer.status.charAt(0) +
                              camper.waitlist_offer.status.slice(1).toLowerCase()}
                        </span>
                        {camper.waitlist_offer.status === 'PENDING' && (
                          <WaitlistOfferControls
                            offerId={camper.waitlist_offer.id}
                            sessionId={sessionId}
                          />
                        )}
                      </div>
                    ) : camper.status === 'WAITLISTED' ? (
                      <span>Waiting</span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td data-label="Attendance">
                    <SessionAttendanceControls camper={camper} sessionId={sessionId} />
                  </td>
                  <td data-label="Pickup">
                    {camper.authorized_pickup_names.length > 0 ? (
                      <ul className="pickupNameList">
                        {camper.authorized_pickup_names.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>No authorized pickup</span>
                    )}
                  </td>
                  <td data-label="Balance">
                    <strong>{money(camper.balance_due_cents)}</strong>
                    <span>{paymentStatusLabel(camper.payment_status)}</span>
                  </td>
                  <td data-label="Source">{camper.source === 'ADMIN' ? 'Admin' : 'Parent'}</td>
                  <td data-label="Registered">
                    {new Date(camper.registered_at).toLocaleDateString('en-US')}
                  </td>
                  <td data-label="Payment">
                    <RegistrationPaymentForm camper={camper} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
