import type { CatalogContext } from '@camp-registration/contracts';
import { AlertCircle, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';

import { getCatalog } from '../../lib/api';

export const dynamic = 'force-dynamic';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function grade(gradeLevel: number): string {
  return gradeLevel === 0 ? 'K' : String(gradeLevel);
}

export default async function ProgramsPage() {
  let programs: CatalogContext['programs'] = [];
  let errorMessage: string | null = null;

  try {
    programs = (await getCatalog()).programs;
  } catch {
    errorMessage = 'Program data could not be loaded. Confirm that the local API is running.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Catalog management</p>
          <h1>Programs</h1>
          <p className="pageDescription">
            Manage the program types used to organize camp sessions.
          </p>
        </div>
        <Link className="buttonPrimary" href="/programs/new">
          <Plus size={17} aria-hidden="true" />
          Add program
        </Link>
      </header>

      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      <section className="contentSection programsManagement" aria-label="Camp programs">
        <div className="listSummary">
          <strong>{programs.length} programs</strong>
          <span>{programs.filter((program) => program.delivery_mode === 'DAY').length} day</span>
          <span>
            {programs.filter((program) => program.delivery_mode === 'OVERNIGHT').length} overnight
          </span>
        </div>
        <div className="tableFrame">
          <table className="programsTable">
            <thead>
              <tr>
                <th>Program</th>
                <th>Code</th>
                <th>Delivery</th>
                <th>Defaults</th>
                <th>Description</th>
                {programs.length > 0 && (
                  <th className="actionColumn" scope="col">
                    <span className="srOnly">Open</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => (
                <tr key={program.id}>
                  <td data-label="Program">
                    <Link className="sessionLink" href={`/programs/${program.id}`}>
                      <strong>{program.name}</strong>
                    </Link>
                  </td>
                  <td data-label="Code">
                    <code>{program.code}</code>
                  </td>
                  <td data-label="Delivery">
                    {program.delivery_mode === 'DAY' ? 'Day' : 'Overnight'}
                  </td>
                  <td data-label="Defaults">
                    Age {program.default_minimum_age}-{program.default_maximum_age} · Grades{' '}
                    {grade(program.default_minimum_grade)}-{grade(program.default_maximum_grade)} ·{' '}
                    {program.default_capacity} spots · {money(program.default_price_cents)} ·{' '}
                    {money(program.default_deposit_cents)} deposit
                  </td>
                  <td data-label="Description">{program.description}</td>
                  <td className="rowAction">
                    <Link href={`/programs/${program.id}`} aria-label={`Edit ${program.name}`}>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && !errorMessage && (
                <tr>
                  <td className="emptyState" colSpan={5}>
                    <strong>No programs yet</strong>
                    <span>Add a program before creating sessions.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
