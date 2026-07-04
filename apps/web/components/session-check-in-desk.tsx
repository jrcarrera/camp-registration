'use client';

import type {
  ProblemResponse,
  RegisteredCamper,
  SessionAttendanceUpdate,
  SessionDetail,
} from '@camp-registration/contracts';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LogOut,
  Search,
  UserCheck,
  UserRoundCheck,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type AttendanceFilter = 'ALL' | RegisteredCamper['attendance_status'];

interface DeskMessage {
  text: string;
  tone: 'error' | 'success';
}

const statusLabels: Record<RegisteredCamper['attendance_status'], string> = {
  ABSENT: 'Absent',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  NOT_MARKED: 'Not marked',
};

const filterLabels: Record<AttendanceFilter, string> = {
  ABSENT: 'Absent',
  ALL: 'All',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  NOT_MARKED: 'Not marked',
};

function isProblem(value: ProblemResponse | SessionDetail): value is ProblemResponse {
  return 'message' in value || 'field_errors' in value;
}

function camperName(camper: RegisteredCamper): string {
  return `${camper.preferred_name ?? camper.first_name} ${camper.last_name}`;
}

function initialNotes(campers: RegisteredCamper[]): Record<string, string> {
  return Object.fromEntries(
    campers.map((camper) => [camper.registration_id, camper.attendance_note ?? '']),
  );
}

function initialPickups(campers: RegisteredCamper[]): Record<string, string> {
  return Object.fromEntries(
    campers.map((camper) => [
      camper.registration_id,
      camper.pickup_name ?? camper.authorized_pickup_names[0] ?? '',
    ]),
  );
}

function timeLabel(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

async function updateAttendance(
  camper: RegisteredCamper,
  sessionId: string,
  action: SessionAttendanceUpdate['action'],
  note: string,
  pickupName: string,
): Promise<ProblemResponse | SessionDetail> {
  try {
    const response = await fetch(
      `/api/v1/sessions/${sessionId}/registrations/${camper.registration_id}/attendance`,
      {
        body: JSON.stringify({
          action,
          note: note.trim() || null,
          pickup_name: action === 'CHECK_OUT' ? pickupName : null,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    return (await response.json()) as ProblemResponse | SessionDetail;
  } catch {
    return { code: 'request_failed', message: 'Attendance could not be updated.' };
  }
}

export function SessionCheckInDesk({ session }: { session: SessionDetail }) {
  const [campers, setCampers] = useState(session.registered_campers);
  const [filter, setFilter] = useState<AttendanceFilter>('ALL');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState(() => initialNotes(session.registered_campers));
  const [pickupNames, setPickupNames] = useState(() => initialPickups(session.registered_campers));
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<DeskMessage | null>(null);

  const confirmedCampers = useMemo(
    () => campers.filter((camper) => camper.status === 'CONFIRMED'),
    [campers],
  );
  const waitlistedCount = campers.filter((camper) => camper.status === 'WAITLISTED').length;
  const counts = useMemo(
    () =>
      confirmedCampers.reduce(
        (total, camper) => {
          total[camper.attendance_status] += 1;
          return total;
        },
        {
          ABSENT: 0,
          CHECKED_IN: 0,
          CHECKED_OUT: 0,
          NOT_MARKED: 0,
        } satisfies Record<RegisteredCamper['attendance_status'], number>,
      ),
    [confirmedCampers],
  );
  const visibleCampers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return confirmedCampers.filter((camper) => {
      const matchesFilter = filter === 'ALL' || camper.attendance_status === filter;
      const searchableText = [
        camperName(camper),
        camper.family_name,
        camper.school_grade ?? '',
        ...camper.authorized_pickup_names,
      ]
        .join(' ')
        .toLowerCase();
      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [confirmedCampers, filter, query]);

  const syncCampers = (updatedCampers: RegisteredCamper[]) => {
    setCampers(updatedCampers);
    setNotes(initialNotes(updatedCampers));
    setPickupNames(initialPickups(updatedCampers));
  };

  const submit = async (
    camper: RegisteredCamper,
    action: SessionAttendanceUpdate['action'],
  ): Promise<void> => {
    const key = `${camper.registration_id}:${action}`;
    setPendingKey(key);
    setMessage(null);
    const result = await updateAttendance(
      camper,
      session.id,
      action,
      notes[camper.registration_id] ?? '',
      pickupNames[camper.registration_id] ?? '',
    );
    if (isProblem(result)) {
      setPendingKey(null);
      setMessage({ text: result.message, tone: 'error' });
      return;
    }
    syncCampers(result.registered_campers);
    setPendingKey(null);
    setMessage({
      text: `${camperName(camper)} ${action === 'CHECK_IN' ? 'checked in' : action === 'CHECK_OUT' ? 'checked out' : 'marked absent'}.`,
      tone: 'success',
    });
  };

  return (
    <section className="checkInDesk" aria-labelledby="check-in-desk-heading">
      <div className="checkInSummaryGrid" aria-label="Check-in summary">
        <div className="checkInSummaryTile">
          <span>Needs action</span>
          <strong>{counts.NOT_MARKED}</strong>
          <small>Not marked</small>
        </div>
        <div className="checkInSummaryTile checkInSummaryActive">
          <span>On site</span>
          <strong>{counts.CHECKED_IN}</strong>
          <small>Checked in</small>
        </div>
        <div className="checkInSummaryTile">
          <span>Dismissed</span>
          <strong>{counts.CHECKED_OUT}</strong>
          <small>Checked out</small>
        </div>
        <div className="checkInSummaryTile">
          <span>Not here</span>
          <strong>{counts.ABSENT}</strong>
          <small>Absent</small>
        </div>
      </div>

      <div className="checkInToolbar">
        <label className="checkInSearch">
          <Search size={16} aria-hidden="true" />
          <span className="srOnly">Search campers</span>
          <input
            value={query}
            type="search"
            placeholder="Search camper, family, grade, or pickup"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="checkInFilters" aria-label="Attendance filters">
          {(['ALL', 'NOT_MARKED', 'CHECKED_IN', 'CHECKED_OUT', 'ABSENT'] as const).map(
            (filterValue) => (
              <button
                key={filterValue}
                className="checkInFilterButton"
                type="button"
                aria-pressed={filter === filterValue}
                onClick={() => setFilter(filterValue)}
              >
                {filterLabels[filterValue]}
                <span>{filterValue === 'ALL' ? confirmedCampers.length : counts[filterValue]}</span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className="checkInDeskIntro">
        <UserRoundCheck size={18} aria-hidden="true" />
        <span>
          {confirmedCampers.length} confirmed campers are available for check-in
          {waitlistedCount > 0 ? `; ${waitlistedCount} waitlisted campers stay on the roster` : ''}.
        </span>
      </div>

      {message && (
        <div
          className={`notice notice${message.tone === 'error' ? 'Error' : 'Success'}`}
          role="status"
        >
          {message.tone === 'error' ? (
            <AlertCircle size={17} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={17} aria-hidden="true" />
          )}
          {message.text}
        </div>
      )}

      <div className="checkInQueue" aria-live="polite">
        {visibleCampers.length === 0 ? (
          <div className="checkInEmpty">
            <Clock3 size={26} aria-hidden="true" />
            <strong>No campers match this view</strong>
            <span>Clear the search or choose a different status filter.</span>
          </div>
        ) : (
          visibleCampers.map((camper) => {
            const note = notes[camper.registration_id] ?? '';
            const pickupName = pickupNames[camper.registration_id] ?? '';
            const checkedInAt = timeLabel(camper.checked_in_at, session.organization_timezone);
            const checkedOutAt = timeLabel(camper.checked_out_at, session.organization_timezone);
            const checkInPending = pendingKey === `${camper.registration_id}:CHECK_IN`;
            const absentPending = pendingKey === `${camper.registration_id}:MARK_ABSENT`;
            const checkOutPending = pendingKey === `${camper.registration_id}:CHECK_OUT`;
            const saving = pendingKey?.startsWith(camper.registration_id) ?? false;

            return (
              <article
                className={`checkInCamperRow checkInCamper${camper.attendance_status.toLowerCase()}`}
                data-testid={`check-in-row-${camper.registration_id}`}
                key={camper.registration_id}
              >
                <div className="checkInCamperIdentity">
                  <span
                    className={`attendanceStatus attendanceStatus${camper.attendance_status.toLowerCase()}`}
                  >
                    {statusLabels[camper.attendance_status]}
                  </span>
                  <div>
                    <h2>{camperName(camper)}</h2>
                    <p>
                      {camper.family_name}
                      {camper.school_grade ? ` · Grade ${camper.school_grade}` : ''}
                      {camper.gender ? ` · ${camper.gender}` : ''}
                    </p>
                  </div>
                  <div className="checkInTimeLine">
                    {checkedInAt && <span>In {checkedInAt}</span>}
                    {checkedOutAt && <span>Out {checkedOutAt}</span>}
                  </div>
                </div>

                <div className="checkInPickupBlock">
                  <details>
                    <summary>
                      {camper.authorized_pickup_names.length > 0
                        ? `${camper.authorized_pickup_names.length} authorized pickup`
                        : 'No authorized pickup'}
                    </summary>
                    {camper.authorized_pickup_names.length > 0 ? (
                      <ul>
                        {camper.authorized_pickup_names.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>Add pickup contacts before checkout.</p>
                    )}
                  </details>
                </div>

                <div className="checkInActions">
                  {(camper.attendance_status === 'NOT_MARKED' ||
                    camper.attendance_status === 'CHECKED_IN') && (
                    <label>
                      Attendance note
                      <input
                        value={note}
                        maxLength={500}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [camper.registration_id]: event.target.value,
                          }))
                        }
                        disabled={saving}
                      />
                    </label>
                  )}

                  {camper.attendance_status === 'CHECKED_IN' && (
                    <label>
                      Pickup person
                      <select
                        value={pickupName}
                        onChange={(event) =>
                          setPickupNames((current) => ({
                            ...current,
                            [camper.registration_id]: event.target.value,
                          }))
                        }
                        disabled={saving || camper.authorized_pickup_names.length === 0}
                      >
                        {camper.authorized_pickup_names.length === 0 ? (
                          <option value="">No authorized pickup</option>
                        ) : (
                          camper.authorized_pickup_names.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  )}

                  {camper.attendance_status === 'NOT_MARKED' && (
                    <div className="checkInButtonSet">
                      <button
                        className="buttonPrimary checkInPrimaryAction"
                        type="button"
                        disabled={saving}
                        onClick={() => void submit(camper, 'CHECK_IN')}
                      >
                        <UserCheck size={17} aria-hidden="true" />
                        {checkInPending ? 'Checking in...' : 'Check in'}
                      </button>
                      <button
                        className="buttonSecondary"
                        type="button"
                        disabled={saving}
                        onClick={() => void submit(camper, 'MARK_ABSENT')}
                      >
                        <UserX size={17} aria-hidden="true" />
                        {absentPending ? 'Marking...' : 'Absent'}
                      </button>
                    </div>
                  )}

                  {camper.attendance_status === 'CHECKED_IN' && (
                    <button
                      className="buttonSecondary checkInCheckoutButton"
                      type="button"
                      disabled={saving || camper.authorized_pickup_names.length === 0}
                      onClick={() => void submit(camper, 'CHECK_OUT')}
                    >
                      <LogOut size={17} aria-hidden="true" />
                      {checkOutPending ? 'Checking out...' : 'Check out'}
                    </button>
                  )}

                  {(camper.attendance_status === 'CHECKED_OUT' ||
                    camper.attendance_status === 'ABSENT') &&
                    camper.attendance_note && (
                      <p className="checkInFinalNote">{camper.attendance_note}</p>
                    )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
