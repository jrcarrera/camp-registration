import type { FamilySummary } from '@camp-registration/contracts';
import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';

export function FamilyTable({ families }: { families: FamilySummary[] }) {
  const empty = families.length === 0;

  return (
    <div className="tableFrame">
      <table className={`programsTable familiesTable${empty ? ' sessionsTableEmpty' : ''}`}>
        <thead>
          <tr>
            <th scope="col">Family</th>
            <th scope="col">Adults</th>
            <th scope="col">Campers</th>
            <th scope="col">Contacts</th>
            {!empty && (
              <th className="actionColumn" scope="col">
                <span className="srOnly">Open</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td className="emptyState" colSpan={5}>
                <Users size={24} aria-hidden="true" />
                <strong>No families yet</strong>
                <span>Create a family before adding adults, campers, and contacts.</span>
              </td>
            </tr>
          ) : (
            families.map((family) => (
              <tr key={family.id}>
                <td data-label="Family">
                  <Link className="sessionLink" href={`/families/${family.id}`}>
                    <strong>{family.family_name}</strong>
                    <span>Updated {new Date(family.updated_at).toLocaleDateString()}</span>
                  </Link>
                </td>
                <td data-label="Adults">{family.adult_count}</td>
                <td data-label="Campers">{family.camper_count}</td>
                <td data-label="Contacts">{family.contact_count}</td>
                <td className="rowAction">
                  <Link href={`/families/${family.id}`} aria-label={`Open ${family.family_name}`}>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
