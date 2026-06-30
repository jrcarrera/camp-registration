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
    age_as_of: program.default_age_as_of,
    available_count: program.default_capacity,
    capacity: program.default_capacity,
    code: '',
    currency: 'USD',
    deposit_cents: program.default_deposit_cents,
    ends_on: `${year}-06-07`,
    id: '00000000-0000-4000-8000-000000000000',
    maximum_age: program.default_maximum_age,
    maximum_grade: program.default_maximum_grade,
    minimum_age: program.default_minimum_age,
    minimum_grade: program.default_minimum_grade,
    name: '',
    organization_id: catalog.organization.id,
    organization_timezone: catalog.organization.timezone,
    price_cents: program.default_price_cents,
    program_id: program.id,
    program_name: program.name,
    registered_campers: [],
    registered_count: 0,
    registered_female_count: 0,
    registered_male_count: 0,
    registration_closes_at: `${year}-05-29T05:00:00Z`,
    registration_opens_at: `${year}-01-15T15:00:00Z`,
    season_id: season.id,
    starts_on: `${year}-06-01`,
    status: 'DRAFT',
    updated_at: new Date().toISOString(),
    version: 1,
    waitlisted_count: 0,
    waitlisted_female_count: 0,
    waitlisted_male_count: 0,
    waitlist_enabled: program.default_waitlist_enabled,
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
