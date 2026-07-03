import type { FamilyDetail } from '@camp-registration/contracts';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { RegistrationCheckoutClient } from '../../../components/registration-checkout-client';
import {
  getParentApiHeaders,
  getParentCatalog,
  getParentFamilies,
  getParentFamily,
  getParentSession,
  getParentSessions,
} from '../../../lib/api';

export const dynamic = 'force-dynamic';

function selectedFamilyForCamper(
  families: FamilyDetail[],
  camperId: string | undefined,
): FamilyDetail | null {
  if (!camperId) return families[0] ?? null;
  return (
    families.find((family) => family.campers.some((camper) => camper.id === camperId)) ??
    families[0] ??
    null
  );
}

export default async function ParentRegistrationPage({
  searchParams,
}: {
  searchParams?: Promise<{ camperId?: string }>;
}) {
  const initialCamperId = (await searchParams)?.camperId;
  const parentHeaders = getParentApiHeaders();
  const [catalogResult, familiesResult, sessionsResult] = await Promise.allSettled([
    getParentCatalog(parentHeaders),
    getParentFamilies(parentHeaders),
    getParentSessions(parentHeaders),
  ]);

  const seasonYearsById =
    catalogResult.status === 'fulfilled'
      ? Object.fromEntries(catalogResult.value.seasons.map((season) => [season.id, season.year]))
      : {};
  const familySummaries =
    familiesResult.status === 'fulfilled' ? familiesResult.value.families : [];
  const familyDetailResults = await Promise.allSettled(
    familySummaries.map((family) => getParentFamily(family.id, parentHeaders)),
  );
  const familyDetails = familyDetailResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const family = selectedFamilyForCamper(familyDetails, initialCamperId);
  const sessionSummaries =
    sessionsResult.status === 'fulfilled' ? sessionsResult.value.sessions : [];
  const sessionDetailResults = await Promise.allSettled(
    sessionSummaries.map((session) => getParentSession(session.id, parentHeaders)),
  );
  const sessions = sessionDetailResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const loadError =
    catalogResult.status === 'rejected' ||
    familiesResult.status === 'rejected' ||
    sessionsResult.status === 'rejected' ||
    familyDetailResults.some((result) => result.status === 'rejected') ||
    sessionDetailResults.some((result) => result.status === 'rejected');

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Parent portal</p>
          <h1>Register for camp</h1>
          <p className="pageDescription">Choose one of your campers and an eligible session.</p>
        </div>
      </header>

      {loadError && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          Registration data could not be loaded.
        </div>
      )}

      {!loadError && !family && (
        <section className="contentSection portalEmptyState" aria-label="No linked family">
          <h2>No linked family account</h2>
          <p>This parent identity is not linked to an adult who can register a family yet.</p>
          <div className="inlineActions">
            <Link className="buttonSecondary" href="/portal">
              My Family
            </Link>
          </div>
        </section>
      )}

      {family && (
        <section className="contentSection registrationCheckout" aria-label="Registration checkout">
          <RegistrationCheckoutClient
            families={[family]}
            hideFamilySelector
            initialCamperId={initialCamperId}
            initialFamily={family}
            requestHeaders={parentHeaders}
            returnHref="/portal"
            returnLabel="My Family"
            seasonYearsById={seasonYearsById}
            sessions={sessions}
          />
        </section>
      )}
    </>
  );
}
