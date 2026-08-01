# ADR 0030: Encrypted Medication Administration Record

- Status: Accepted
- Date: 2026-07-28

## Context

The restricted health aggregate stores parent-supplied medication text, but it
does not give health staff an operational record of which scheduled or
as-needed doses were administered during camp. Camps need a daily round that
prevents two staff members from recording the same scheduled dose, preserves
exceptions, and does not expose medication details through ordinary rosters,
logs, or audit events.

Medication names, doses, instructions, schedules, and administration notes are
Restricted data. The existing health-record security boundary already provides
tenant RLS, MFA-gated health roles, AES-256-GCM encryption with versioned keys,
private/no-store HTTP responses, and structured access auditing.

## Decision

Implement Medication Administration Record v1 as two tenant-owned,
row-level-secured aggregates:

- `camper_medication_orders` stores only operational state and
  application-encrypted medication name, dose, instructions, and local
  administration times. An order is either scheduled or PRN and can only be
  discontinued, not rewritten.
- `camper_medication_administrations` stores append-only outcomes (`GIVEN`,
  `REFUSED`, `HELD`, or `MISSED`). Administration notes are encrypted. A
  partial unique index on organization, order, and scheduled time prevents a
  second result for the same scheduled dose.

Only health staff, camp administrators, and organization administrators with a
verified MFA session may use the workflow. An order requires a confirmed camper
registration in the selected tenant-owned session. Non-given outcomes require
a reason. The service validates schedule slots in the organization timezone and
rejects future administration timestamps.

Daily center responses contain decrypted Restricted data only after
authorization and use `Cache-Control: private, no-store`. Audit events record
action, outcome, order or administration identifiers, schedule type, session,
date, and counts; they never copy medication names, doses, instructions, or
notes.

## Consequences

- The health center has one responsive daily view for scheduled and PRN
  administrations with an append-only history.
- Competing clients cannot record the same scheduled dose twice.
- Historical events survive order discontinuation.
- The first version requires health staff to create medication orders from
  reviewed source documentation. It does not infer structured orders from the
  parent health record's free-text medication list.
- Corrections, witness/co-signature policy, inventory counts, late/early
  variance alerts, automatic parent notifications, offline rounds, medication
  barcode scanning, and clinical print/export projections remain later
  policy-dependent slices.
