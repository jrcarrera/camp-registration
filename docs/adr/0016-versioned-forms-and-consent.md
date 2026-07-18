# ADR 0016: Versioned Forms and Consent Records

- Status: Accepted
- Date: 2026-07-18
- Decision owners: Project maintainers

## Context

The fixed parent readiness page can collect current camper and contact details,
but it cannot prove which waiver text or questions a parent reviewed. Editing a
shared form in place would make historical consent ambiguous, and copying forms
per session would make common camp requirements expensive to maintain.

The first forms slice must support reusable requirements, draft persistence,
electronic signatures, tenant isolation, and staff completion visibility while
keeping restricted clinical records outside the general forms aggregate.

## Decision

- Store an editable tenant-owned form template separately from its published
  versions.
- Publishing snapshots the name, instructions, field definitions, publisher,
  and publication time into an immutable version. Runtime permissions do not
  allow published versions or their session assignments to be updated.
- Assign a published version to one or more sessions. Every confirmed
  registration in an assigned session receives an obligation; future confirmed
  registrations receive the same obligation without copying rows.
- Support text, single-choice, date, acknowledgement, and typed-signature fields
  in v1. Conditional logic and uploads are deferred.
- Persist drafts with optimistic version checks. A submitted response is locked
  and records the signer name, authenticated actor, submission time, exact form
  version, and structured audit event.
- Require a linked adult with family-management permission for parent reads and
  writes. Staff may view template and completion metadata; only administrators
  may author or publish templates.
- Keep allergies, medications, diagnoses, and uploaded medical documents out of
  this aggregate. Those remain subject to the restricted health-record boundary.

## Consequences

Historical consent remains attributable even after the reusable draft changes.
Staff can publish a new version when consent language changes, and requiring the
new version creates a new obligation rather than rewriting prior submissions.

Completion totals are derived from confirmed registrations and submitted
responses. v1 does not yet provide automated reminders, a dedicated missing-form
queue, conditional questions, uploads, PDF packets, or restricted health data.

## Alternatives Considered

- Edit assigned forms in place: rejected because historical consent would no
  longer identify the exact text presented to the signer.
- Copy editable questions directly onto every session: rejected because common
  requirements would drift across sessions.
- Store typed signatures without actor and version metadata: rejected because a
  name alone is not a sufficient consent history.
- Treat medical intake as ordinary form responses: rejected by the existing
  health-data separation and access-audit decisions.

## Revisit When

Revisit when operators need conditional logic, upload classification and
retention, PDF packets, signature-provider integration, reminders, or
registration statuses beyond confirmed enrollment to receive obligations.
