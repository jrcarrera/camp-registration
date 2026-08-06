'use client';
import type { SessionSummary, SessionWorkforceRoster } from '@camp-registration/contracts';
import { useEffect, useRef, useState } from 'react';
export function WorkforceSessionRoster({
  initialRoster,
  sessions,
}: {
  initialRoster?: SessionWorkforceRoster | null;
  sessions: SessionSummary[];
}) {
  const [roster, setRoster] = useState<SessionWorkforceRoster | null>(initialRoster ?? null),
    [message, setMessage] = useState(
      'Choose a session to view its current confirmed workforce roster.',
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const requestNumber = useRef(0);
  const load = async (id: string) => {
    const current = ++requestNumber.current;
    setRoster(null);
    setError(false);
    if (!id) {
      setMessage('Choose a session to view its current confirmed workforce roster.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/sessions/${id}/workforce-roster`);
      if (current !== requestNumber.current) return;
      if (!response.ok) {
        setMessage((await response.json()).message);
        setError(true);
        return;
      }
      setRoster(await response.json());
    } catch {
      if (current === requestNumber.current) {
        setError(true);
        setMessage('The workforce roster could not be loaded.');
      }
    } finally {
      if (current === requestNumber.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (sessions[0] && !initialRoster) void load(sessions[0].id);
  }, [initialRoster, sessions]);
  return (
    <div className="workspace workforceRoster" aria-busy={loading}>
      <header>
        <p className="eyebrow">Daily operations</p>
        <h1>Session workforce roster</h1>
        <p>
          This roster intentionally excludes contact details, linked account state, and
          administration controls.
        </p>
      </header>
      <label>
        Session
        <select onChange={(e) => void load(e.target.value)} defaultValue={sessions[0]?.id ?? ''}>
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
      {roster && (
        <section>
          <h2>{roster.session_name}</h2>
          {roster.assignments.length === 0 ? (
            <p>No current confirmed workforce assignments.</p>
          ) : (
            <table>
              <caption>Current confirmed assignments</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Position</th>
                  <th>Dates</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {roster.assignments.map((a, index) => (
                  <tr key={`${a.display_name}:${a.position_name}:${a.starts_on}:${index}`}>
                    <td data-label="Name">{a.display_name}</td>
                    <td data-label="Type">{a.workforce_type.toLowerCase()}</td>
                    <td data-label="Position">{a.position_name}</td>
                    <td data-label="Dates">
                      {a.starts_on}–{a.ends_on}
                    </td>
                    <td data-label="Status">{a.status.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
