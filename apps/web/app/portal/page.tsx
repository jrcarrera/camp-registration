import type { FamilyDetail } from '@camp-registration/contracts';
import { AlertCircle } from 'lucide-react';

import { ParentPortalDashboard } from '../../components/parent-portal-dashboard';
import { getParentApiHeaders, getParentFamilies, getParentFamily } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
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
        <ParentPortalDashboard initialFamilies={families} requestHeaders={parentHeaders} />
      )}
    </>
  );
}
