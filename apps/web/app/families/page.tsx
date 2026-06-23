import type { FamilySummary } from '@camp-registration/contracts';
import { AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';

import { FamilyTable } from '../../components/family-table';
import { getFamilies } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  let families: FamilySummary[] = [];
  let errorMessage: string | null = null;

  try {
    families = (await getFamilies()).families;
  } catch {
    errorMessage = 'Family data could not be loaded. Confirm that the local API is running.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Family management</p>
          <h1>Families</h1>
          <p className="pageDescription">
            Manage household accounts, adult permissions, camper profiles, and contacts.
          </p>
        </div>
        <Link className="buttonPrimary" href="/families/new">
          <Plus size={17} aria-hidden="true" />
          Add family
        </Link>
      </header>

      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      <section className="contentSection familiesManagement" aria-label="Families">
        <div className="listSummary">
          <strong>{families.length} families</strong>
          <span>{families.reduce((total, family) => total + family.camper_count, 0)} campers</span>
          <span>{families.reduce((total, family) => total + family.adult_count, 0)} adults</span>
        </div>
        <FamilyTable families={families} />
      </section>
    </>
  );
}
