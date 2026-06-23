import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { SeasonCreateForm } from '../../../components/season-create-form';
import { getCatalog } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function NewSeasonPage() {
  const catalog = await getCatalog();
  const defaultYear =
    Math.max(new Date().getUTCFullYear(), ...catalog.seasons.map((season) => season.year)) + 1;

  return (
    <>
      <Link className="backLink" href="/seasons">
        <ArrowLeft size={16} aria-hidden="true" />
        Seasons
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">New season</p>
          <h1>Create season</h1>
          <p className="pageDescription">Add a season that sessions can be assigned to.</p>
        </div>
      </header>
      <SeasonCreateForm defaultYear={defaultYear} />
    </>
  );
}
