import type { FamilyDetail } from '@camp-registration/contracts';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { HouseholdCart } from '../../../components/household-cart';
import {
  getParentApiHeaders,
  getParentFamilies,
  getParentFamily,
  getParentOrders,
  getParentPricing,
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
  const [familiesResult, sessionsResult, pricingResult] = await Promise.allSettled([
    getParentFamilies(parentHeaders),
    getParentSessions(parentHeaders),
    getParentPricing(parentHeaders),
  ]);

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
  const ordersResult = family
    ? await Promise.allSettled([getParentOrders(family.id, parentHeaders)])
    : [];
  const loadError =
    familiesResult.status === 'rejected' ||
    sessionsResult.status === 'rejected' ||
    pricingResult.status === 'rejected' ||
    familyDetailResults.some((result) => result.status === 'rejected') ||
    sessionDetailResults.some((result) => result.status === 'rejected') ||
    ordersResult.some((result) => result.status === 'rejected');

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Parent portal</p>
          <h1>Register for camp</h1>
          <p className="pageDescription">
            Build one household order for multiple campers, sessions, and payment choices.
          </p>
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

      {family && pricingResult.status === 'fulfilled' && (
        <section aria-label="Household registration checkout">
          <HouseholdCart
            family={family}
            initialCamperId={initialCamperId}
            initialOrders={
              ordersResult[0]?.status === 'fulfilled' ? ordersResult[0].value.orders : []
            }
            pricing={pricingResult.value}
            requestHeaders={parentHeaders}
            sessions={sessions}
          />
        </section>
      )}
    </>
  );
}
