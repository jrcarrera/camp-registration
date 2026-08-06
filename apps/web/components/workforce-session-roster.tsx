'use client';
import type { SessionSummary, SessionWorkforceRoster } from '@camp-registration/contracts';
import { useRef, useState } from 'react';
export function WorkforceSessionRoster({ sessions }: { sessions: SessionSummary[] }) {
  const [roster, setRoster] = useState<SessionWorkforceRoster | null>(null),
    [message, setMessage] = useState(
      'Choose a session to view its current confirmed workforce roster.',
    ),
    [loading, setLoading] = useState(false);
  const requestNumber = useRef(0);
  const load = async (id: string) => {
    const current = ++requestNumber.current;
    setRoster(null);
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
        return;
      }
      setRoster(await response.json());
    } catch {
      if (current === requestNumber.current)
        setMessage('The workforce roster could not be loaded.');
    } finally {
      if (current === requestNumber.current) setLoading(false);
    }
  };
  return (
    <div className="workspace workforceRoster">
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
        <select onChange={(e) => void load(e.target.value)} defaultValue="">
          <option value="">Choose a session</option>
          {sessions.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p role={loading ? 'status' : 'alert'}>{message}</p>}
      {roster && (
        <section>
          <h2>{roster.session_name}</h2>
          {roster.assignments.length === 0 ? (
            <p>No current confirmed workforce assignments.</p>
          ) : (
            <table>
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
                {roster.assignments.map((a) => (
                  <tr key={`${a.display_name}:${a.position_name}:${a.starts_on}`}>
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
