import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SeasonRolloverForm } from '../../../../components/season-rollover-form';
import { getCatalog, getSessions } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SeasonRolloverPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const [catalog, sessionResponse] = await Promise.all([getCatalog(), getSessions()]);
  const sourceSeason = catalog.seasons.find((season) => season.id === seasonId);
  if (!sourceSeason) notFound();
  const sessionCount = sessionResponse.sessions.filter(
    (session) =>
      session.season_id === seasonId &&
      (session.status === 'DRAFT' || session.status === 'PUBLISHED'),
  ).length;
  if (sessionCount === 0) notFound();
  const defaultYear = Math.max(
    sourceSeason.year + 1,
    ...catalog.seasons.map(({ year }) => year + 1),
  );

  return (
    <>
      <Link className="backLink" href="/seasons">
        <ArrowLeft size={16} aria-hidden="true" />
        Seasons
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">Season rollover</p>
          <h1>Copy {sourceSeason.name}</h1>
          <p className="pageDescription">
            Start the next registration cycle from a reviewed copy of this season.
          </p>
        </div>
      </header>
      <SeasonRolloverForm
        defaultYear={defaultYear}
        sessionCount={sessionCount}
        sourceSeason={sourceSeason}
      />
    </>
  );
}
