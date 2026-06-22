import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { ProgramCreateForm } from '../../../components/program-create-form';

export default function NewProgramPage() {
  return (
    <>
      <Link className="backLink" href="/programs">
        <ArrowLeft size={16} aria-hidden="true" />
        Programs
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">New catalog type</p>
          <h1>Create program</h1>
          <p className="pageDescription">
            Define a reusable program type for one or more camp sessions.
          </p>
        </div>
      </header>
      <ProgramCreateForm />
    </>
  );
}
