# ADR 0010: Camper Profile and Health Data Boundary

- Status: Accepted
- Date: 2026-06-23
- Decision owners: Project owner
- Related decisions: [ADR 0004](0004-health-data-separation.md)

## Context

ADR 0004 requires health and safety data to be stored separately from core camper
demographic records. The family domain needs the same rule stated at the camper
profile and API boundary so ordinary family, roster, and registration workflows
do not accidentally expose medical forms, medications, allergies, uploaded
medical documents, or related notes.

Base camper profile data and health-related data have different sensitivity,
access, retention, and audit requirements.

## Decision

Base camper identity/profile data must remain separate from health records,
medical forms, medications, allergies, and medical document access.

Health-related records belong in a separate health domain with stricter access
control, audit logging, and retention rules. Camper profile APIs must not return
health fields by default.

## Consequences

- Camper profile APIs do not include health fields by default.
- Health data can use narrower authorization, separate audit events, and later
  encryption controls without changing basic camper records.
- Medical document access remains auditable.
- Roster, attendance, family, and registration screens can use basic camper data
  without increasing exposure of health information.
- Implementation must avoid adding health columns to common camper profile
  tables for convenience.

## Alternatives Considered

- Rely only on ADR 0004: rejected because family-domain implementation needs an
  explicit camper profile and API boundary.
- Store health fields directly on camper records: rejected by ADR 0004 because
  it broadens routine access to Restricted data.

## Revisit When

Revisit only through a superseding security and domain ADR if health workflows
require a materially different storage, authorization, or API boundary.
