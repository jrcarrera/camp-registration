import type { SessionDetail } from '@camp-registration/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { SessionEditor } from '../../../components/session-editor';
import { getCatalog } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams?: Promise<{ seasonId?: string }>;
}) {
  const catalog = await getCatalog();
  const requestedSeasonId = (await searchParams)?.seasonId;
  const season =
    catalog.seasons.find((candidate) => candidate.id === requestedSeasonId) ?? catalog.seasons[0];
  const program = catalog.programs[0];

  if (!season || !program) {
    throw new Error('A season and program are required before a session can be created.');
  }

  const year = season.year;
  const session: SessionDetail = {
    active_hold_count: 0,
    age_as_of: 'SESSION_START',
    available_count: 20,
    capacity: 20,
    code: '',
    currency: 'USD',
    deposit_cents: 0,
    ends_on: `${year}-06-07`,
    id: '00000000-0000-4000-8000-000000000000',
    maximum_age: 18,
    minimum_age: 5,
    name: '',
    organization_id: catalog.organization.id,
    organization_timezone: catalog.organization.timezone,
    price_cents: 0,
    program_id: program.id,
    program_name: program.name,
    registered_campers: [],
    registered_count: 0,
    registration_closes_at: `${year}-05-29T05:00:00Z`,
    registration_opens_at: `${year}-01-15T15:00:00Z`,
    season_id: season.id,
    starts_on: `${year}-06-01`,
    status: 'DRAFT',
    updated_at: new Date().toISOString(),
    version: 1,
    waitlist_enabled: true,
  };

  return (
    <>
      <Link className="backLink" href={season ? `/sessions?seasonId=${season.id}` : '/sessions'}>
        <ArrowLeft size={16} aria-hidden="true" />
        Sessions
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">New week</p>
          <h1>Create session</h1>
          <p className="pageDescription">Add a week to {season.name}.</p>
        </div>
      </header>
      <SessionEditor
        mode="create"
        programs={catalog.programs}
        seasons={catalog.seasons}
        session={session}
      />
    </>
  );
}
