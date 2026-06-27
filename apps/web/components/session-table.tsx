import type { SessionSummary } from '@camp-registration/contracts';
import { CalendarDays, ChevronRight } from 'lucide-react';
import Link from 'next/link';

function formatDates(startsOn: string, endsOn: string): string {
  const start = new Date(`${startsOn}T12:00:00Z`);
  const end = new Date(`${endsOn}T12:00:00Z`);
  const startText = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(start);
  const endText = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end);
  return `${startText} - ${endText}`;
}

function formatRosterCount(total: number, male: number, female: number): string {
  return `${total} (${male} M, ${female} F)`;
}

export function SessionTable({ sessions }: { sessions: SessionSummary[] }) {
  const empty = sessions.length === 0;

  return (
    <div className="tableFrame">
      <table className={`sessionsTable${empty ? ' sessionsTableEmpty' : ''}`}>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Dates</th>
            <th scope="col">Capacity</th>
            <th scope="col">Registered</th>
            <th scope="col">Wait List</th>
            <th scope="col">Status</th>
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
              <td className="emptyState" colSpan={6}>
                <CalendarDays size={24} aria-hidden="true" />
                <strong>No sessions yet</strong>
                <span>No sessions are available for the selected season.</span>
              </td>
            </tr>
          ) : (
            sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <Link className="sessionLink" href={`/sessions/${session.id}`}>
                    <strong>{session.name}</strong>
                    <span>
                      {session.program_name} · {session.code}
                    </span>
                  </Link>
                </td>
                <td data-label="Dates">{formatDates(session.starts_on, session.ends_on)}</td>
                <td data-label="Capacity">{session.capacity}</td>
                <td data-label="Registered">
                  {formatRosterCount(
                    session.registered_count,
                    session.registered_male_count,
                    session.registered_female_count,
                  )}
                </td>
                <td data-label="Wait List">
                  {formatRosterCount(
                    session.waitlisted_count,
                    session.waitlisted_male_count,
                    session.waitlisted_female_count,
                  )}
                </td>
                <td data-label="Status">
                  <span className={`statusBadge status${session.status.toLowerCase()}`}>
                    {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="rowAction">
                  <Link href={`/sessions/${session.id}`} aria-label={`Edit ${session.name}`}>
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
