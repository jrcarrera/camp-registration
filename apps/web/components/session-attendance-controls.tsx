'use client';

import type {
  ProblemResponse,
  RegisteredCamper,
  SessionAttendanceUpdate,
  SessionDetail,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, LogOut, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AttendanceState {
  message: string | null;
  savingAction: SessionAttendanceUpdate['action'] | null;
  tone: 'error' | 'success';
}

const cleanState: AttendanceState = {
  message: null,
  savingAction: null,
  tone: 'success',
};

const statusLabels: Record<RegisteredCamper['attendance_status'], string> = {
  ABSENT: 'Absent',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  NOT_MARKED: 'Not marked',
};

function isProblem(value: ProblemResponse | SessionDetail): value is ProblemResponse {
  return 'message' in value || 'field_errors' in value;
}

function timeLabel(value: string | null): string | null {
  if (!value) return null;
  return `${new Date(value).toISOString().slice(11, 16)} UTC`;
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

export function SessionAttendanceControls({
  camper,
  sessionId,
}: {
  camper: RegisteredCamper;
  sessionId: string;
}) {
  const [currentCamper, setCurrentCamper] = useState(camper);
  const [note, setNote] = useState(currentCamper.attendance_note ?? '');
  const [pickupName, setPickupName] = useState(
    currentCamper.pickup_name ?? currentCamper.authorized_pickup_names[0] ?? '',
  );
  const [state, setState] = useState<AttendanceState>(cleanState);
  const disabled = currentCamper.status !== 'CONFIRMED';
  const saving = state.savingAction !== null;
  const checkedInAt = timeLabel(currentCamper.checked_in_at);
  const checkedOutAt = timeLabel(currentCamper.checked_out_at);

  useEffect(() => {
    setCurrentCamper(camper);
    setNote(camper.attendance_note ?? '');
    setPickupName(camper.pickup_name ?? camper.authorized_pickup_names[0] ?? '');
  }, [camper]);

  const submit = async (action: SessionAttendanceUpdate['action']) => {
    setState({ ...cleanState, savingAction: action });
    const result = await updateAttendance(currentCamper, sessionId, action, note, pickupName);
    if (isProblem(result)) {
      setState({ message: result.message, savingAction: null, tone: 'error' });
      return;
    }
    const updatedCamper = result.registered_campers.find(
      (registeredCamper) => registeredCamper.registration_id === currentCamper.registration_id,
    );
    if (updatedCamper) {
      setCurrentCamper(updatedCamper);
      setNote(updatedCamper.attendance_note ?? '');
      setPickupName(updatedCamper.pickup_name ?? updatedCamper.authorized_pickup_names[0] ?? '');
    }
    setState({ message: 'Attendance updated.', savingAction: null, tone: 'success' });
  };

  return (
    <div
      className="attendanceControls"
      data-testid={`attendance-controls-${currentCamper.registration_id}`}
    >
      <div className="attendanceStatusLine">
        <span
          className={`attendanceStatus attendanceStatus${currentCamper.attendance_status.toLowerCase()}`}
        >
          {statusLabels[currentCamper.attendance_status]}
        </span>
        {checkedInAt && <small>In {checkedInAt}</small>}
        {checkedOutAt && <small>Out {checkedOutAt}</small>}
      </div>

      {currentCamper.attendance_status === 'CHECKED_IN' && (
        <label>
          Pickup
          <select
            aria-label="Pickup person"
            value={pickupName}
            onChange={(event) => setPickupName(event.target.value)}
            disabled={disabled || saving || currentCamper.authorized_pickup_names.length === 0}
          >
            {currentCamper.authorized_pickup_names.length === 0 ? (
              <option value="">No authorized pickup</option>
            ) : (
              currentCamper.authorized_pickup_names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>
        </label>
      )}

      {(currentCamper.attendance_status === 'NOT_MARKED' ||
        currentCamper.attendance_status === 'CHECKED_IN') && (
        <label>
          Note
          <input
            aria-label="Attendance note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            disabled={disabled || saving}
          />
        </label>
      )}

      {currentCamper.attendance_status === 'NOT_MARKED' && (
        <div className="attendanceButtonRow">
          <button
            className="buttonPrimary"
            type="button"
            disabled={disabled || saving}
            onClick={() => void submit('CHECK_IN')}
          >
            <UserCheck size={16} aria-hidden="true" />
            {state.savingAction === 'CHECK_IN' ? 'Checking in...' : 'Check in'}
          </button>
          <button
            className="buttonSecondary"
            type="button"
            disabled={disabled || saving}
            onClick={() => void submit('MARK_ABSENT')}
          >
            <UserX size={16} aria-hidden="true" />
            {state.savingAction === 'MARK_ABSENT' ? 'Marking...' : 'Absent'}
          </button>
        </div>
      )}

      {currentCamper.attendance_status === 'CHECKED_IN' && (
        <button
          className="buttonSecondary"
          type="button"
          disabled={disabled || saving || currentCamper.authorized_pickup_names.length === 0}
          onClick={() => void submit('CHECK_OUT')}
        >
          <LogOut size={16} aria-hidden="true" />
          {state.savingAction === 'CHECK_OUT' ? 'Checking out...' : 'Check out'}
        </button>
      )}

      {(currentCamper.attendance_status === 'CHECKED_OUT' ||
        currentCamper.attendance_status === 'ABSENT') &&
        currentCamper.attendance_note && (
          <small className="attendanceNote">{currentCamper.attendance_note}</small>
        )}

      {state.message && (
        <span className={`attendanceMessage attendance${state.tone}`} role="status">
          {state.tone === 'error' ? (
            <AlertCircle size={14} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={14} aria-hidden="true" />
          )}
          {state.message}
        </span>
      )}
    </div>
  );
}
