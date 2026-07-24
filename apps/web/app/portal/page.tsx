import type { FamilyDetail, ReEnrollmentOption } from '@camp-registration/contracts';
import { AlertCircle, CalendarSync } from 'lucide-react';
import Link from 'next/link';

import { ParentPortalDashboard } from '../../components/parent-portal-dashboard';
import {
  getParentApiHeaders,
  getParentFamilies,
  getParentFamily,
  getParentReEnrollmentOptions,
} from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const parentHeaders = getParentApiHeaders();
  let families: FamilyDetail[] = [];
  let reEnrollmentOptions: ReEnrollmentOption[] = [];
  let errorMessage: string | null = null;

  try {
    const response = await getParentFamilies(parentHeaders);
    families = await Promise.all(
      response.families.map((family) => getParentFamily(family.id, parentHeaders)),
    );
    const optionResults = await Promise.allSettled(
      families.map((family) => getParentReEnrollmentOptions(family.id, parentHeaders)),
    );
    reEnrollmentOptions = optionResults.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.options : [],
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

      {payment === 'success' && (
        <div className="notice noticeSuccess" role="status">
          Payment received. Your camp balance has been updated and a receipt is on its way.
        </div>
      )}

      {payment === 'cancelled' && (
        <div className="notice" role="status">
          Payment was cancelled. No charge was recorded; you can retry when ready.
        </div>
      )}

      {!errorMessage && families.length === 0 && (
        <section className="contentSection portalEmptyState" aria-label="No linked family">
          <h2>No linked family account</h2>
          <p>This parent identity is not linked to an adult who can view or manage a family yet.</p>
        </section>
      )}

      {!errorMessage && families.length > 0 && (
        <>
          {reEnrollmentOptions.length > 0 && (
            <section
              className="contentSection portalReEnrollment"
              aria-labelledby="re-enrollment-heading"
            >
              <div className="sectionHeading">
                <div>
                  <p className="contextLabel">Returning family</p>
                  <h2 id="re-enrollment-heading">Register again</h2>
                  <p className="sectionDescription">
                    Start from a camper’s confirmed registration in a prior season. Current
                    eligibility, availability, pricing, and payment rules are checked before
                    submission.
                  </p>
                </div>
              </div>
              <div className="portalPlanList">
                {reEnrollmentOptions.map((option) => (
                  <article
                    className="portalPlanItem"
                    key={`${option.camper_id}-${option.target_session_id}`}
                  >
                    <span className="portalPlanIcon" aria-hidden="true">
                      <CalendarSync size={18} />
                    </span>
                    <div className="portalPlanContent">
                      <div>
                        <strong>{option.target_session_name}</strong>
                        <span>
                          {option.camper_name} · from {option.previous_session_name} in{' '}
                          {option.previous_season_name}
                        </span>
                      </div>
                      <div className="portalPlanMeta">
                        <span>{option.target_season_name}</span>
                        <span>
                          {new Date(`${option.starts_on}T12:00:00`).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="portalPlanActions">
                      <Link
                        className="buttonPrimary"
                        href={`/portal/register?camperId=${option.camper_id}&sessionId=${option.target_session_id}`}
                      >
                        Start re-enrollment
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <ParentPortalDashboard initialFamilies={families} requestHeaders={parentHeaders} />
        </>
      )}
    </>
  );
}
