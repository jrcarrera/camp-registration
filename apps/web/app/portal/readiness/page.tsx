import type { FamilyDetail } from '@camp-registration/contracts';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { ParentReadinessWorkspace } from '../../../components/parent-readiness-workspace';
import { getParentApiHeaders, getParentFamilies, getParentFamily } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentReadinessPage() {
  const parentHeaders = getParentApiHeaders();
  let families: FamilyDetail[] = [];
  let errorMessage: string | null = null;

  try {
    const response = await getParentFamilies(parentHeaders);
    families = await Promise.all(
      response.families.map((family) => getParentFamily(family.id, parentHeaders)),
    );
  } catch {
    errorMessage = 'Camp readiness information could not be loaded.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Parent portal</p>
          <h1>Camp readiness</h1>
          <p className="pageDescription">
            Complete camper profile details, health notes, emergency contacts, and authorized pickup
            information before camp.
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
          <p>This parent identity is not linked to an adult who can manage a family yet.</p>
          <div className="inlineActions">
            <Link className="buttonSecondary" href="/portal">
              My Family
            </Link>
          </div>
        </section>
      )}

      {!errorMessage && families.length > 0 && (
        <ParentReadinessWorkspace initialFamilies={families} requestHeaders={parentHeaders} />
      )}
    </>
  );
}
