import type { CatalogContext } from '@camp-registration/contracts';
import { AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';

import { getCatalog } from '../../lib/api';

export const dynamic = 'force-dynamic';

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
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => (
                <tr key={program.id}>
                  <td data-label="Program">
                    <strong>{program.name}</strong>
                  </td>
                  <td data-label="Code">
                    <code>{program.code}</code>
                  </td>
                  <td data-label="Delivery">
                    {program.delivery_mode === 'DAY' ? 'Day' : 'Overnight'}
                  </td>
                  <td data-label="Description">{program.description}</td>
                </tr>
              ))}
              {programs.length === 0 && !errorMessage && (
                <tr>
                  <td className="emptyState" colSpan={4}>
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
