import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { FamilyCreateForm } from '../../../components/family-create-form';

export default function NewFamilyPage() {
  return (
    <>
      <Link className="backLink" href="/families">
        <ArrowLeft size={16} aria-hidden="true" />
        Families
      </Link>
      <header className="editorHeader">
        <div>
          <p className="contextLabel">New household</p>
          <h1>Create family</h1>
          <p className="pageDescription">
            Add the household account before adding adults, campers, and contacts.
          </p>
        </div>
      </header>
      <FamilyCreateForm />
    </>
  );
}
