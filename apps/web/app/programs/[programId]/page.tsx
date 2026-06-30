import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProgramEditor } from '../../../components/program-create-form';
import { getCatalog } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ProgramEditorPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const catalog = await getCatalog();
  const program = catalog.programs.find((candidate) => candidate.id === programId);

  if (!program) notFound();

  return (
    <>
      <Link className="backLink" href="/programs">
        <ArrowLeft size={16} aria-hidden="true" />
        Programs
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">{program.code}</p>
          <h1>{program.name}</h1>
          <p className="pageDescription">
            Edit program metadata and the defaults inherited by newly created sessions.
          </p>
        </div>
      </header>
      <ProgramEditor mode="edit" program={program} />
    </>
  );
}
