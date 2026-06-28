import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FamilyDetailClient } from '../../../components/family-detail-client';
import { ApiError, getFamily, getSessions } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;

  try {
    const [family, sessionResponse] = await Promise.all([getFamily(familyId), getSessions()]);
    return (
      <>
        <Link className="backLink" href="/families">
          <ArrowLeft size={16} aria-hidden="true" />
          Families
        </Link>
        <header className="editorHeader">
          <div>
            <p className="contextLabel">Family account</p>
            <h1>{family.family_name}</h1>
            <p className="pageDescription">
              {family.adult_count} adults, {family.camper_count} campers, {family.contact_count}{' '}
              contacts
            </p>
          </div>
        </header>
        <FamilyDetailClient initialFamily={family} sessions={sessionResponse.sessions} />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
