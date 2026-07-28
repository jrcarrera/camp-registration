# ADR 0028: Daily Attendance and Bulk Roll Call

- Status: Accepted
- Date: 2026-07-27
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0022

## Context

The application already stores attendance by registration and local attendance
date, but staff could only operate on the current day one camper at a time.
Day-camp teams need to move across session days, see which days are incomplete,
and record a routine roll call without losing the individual pickup controls.

## Decision

Expose the existing tenant-owned daily attendance history through:

- a selected-date session projection;
- a full-session strip of current-roster daily totals; and
- one atomic bulk command for checking in or marking absent selected confirmed
  campers who have not yet been marked on that date.

Keep bulk checkout out of scope. Checkout still requires an individual,
currently authorized pickup person and remains on the existing per-camper path.

Reject the entire bulk command when any selected registration is missing,
waitlisted, cancelled, belongs to another session or tenant, or already has an
attendance record for the selected date. Record one
`attendance.bulk_updated` audit event with the action, date, count, and session;
do not copy camper identifiers into the audit details. Attendance responses are
private and non-cacheable.

Reuse `registration_attendance` from migration 0016. Its tenant RLS,
session/registration foreign keys, per-registration/day uniqueness, and daily
index already match this feature, so a parallel table or migration would add no
new invariant.

## Consequences

- Staff can review and operate across every date in a session.
- Routine roll call becomes one transaction while individual exceptions remain
  explicit.
- Concurrent or stale bulk selections fail safely instead of overwriting a
  more recent individual action.
- Daily totals describe the current confirmed roster. They do not reconstruct
  historical roster membership for campers later cancelled or transferred.

## Alternatives Considered

- Update every selected camper through separate API calls: rejected because a
  partial batch could leave an ambiguous roll call.
- Permit bulk checkout: rejected because custody release must retain an
  individual authorized-pickup choice.
- Add a second attendance-history table: rejected because the existing daily
  record already has the required tenant, date, status, audit actor, and
  concurrency boundaries.

## Revisit When

Revisit for correction history, late/early classifications, historical roster
snapshots, offline operation, transportation exceptions, or bulk actions that
need per-camper notes.
