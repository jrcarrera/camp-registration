# ADR 0029: Encrypted Incident and Injury Log

- Status: Accepted
- Date: 2026-07-27
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0004, ADR 0005, ADR 0007, ADR 0023

## Context

Health staff need a durable operational record when a camper is injured, becomes
ill, or is involved in another health or safety incident. A mutable free-text
field on the camper profile would lose the sequence of follow-up decisions and
would expose Restricted narrative data to ordinary family, roster, and report
queries.

The shipped Restricted Health Records boundary already supplies tenant RLS,
AES-256-GCM encryption, versioned keys, MFA-aware health authorization, and
structured audit events. The incident workflow should extend that boundary
without turning general attendance or camper records into clinical-data paths.

## Decision

- Store an incident header in `camper_health_incidents` only for a camper with a
  confirmed registration in the selected tenant-owned session.
- Keep the minimum operational projection in plaintext: camper/session
  identifiers, type, severity, state, occurrence time, guardian-notification
  state, version, and resolution timestamps. Encrypt location, narrative, care,
  and guardian identity/time with AES-256-GCM.
- Bind authenticated encryption to the organization, camper, and incident
  identifiers. Each follow-up entry also binds to its own identifier.
- Store follow-up and resolution notes as append-only encrypted rows in
  `camper_health_incident_entries`. The original incident narrative is
  immutable. Resolving an incident atomically appends a resolution entry and
  closes the header.
- Use optimistic versions so a stale follow-up or resolution cannot silently
  overwrite another health worker's action.
- Restrict list, read, create, follow-up, and resolution operations to
  `health_staff`, `camp_admin`, and `organization_admin` memberships with
  verified MFA. Parents and ordinary camp staff do not receive this workspace
  in v1.
- Return every response with `Cache-Control: private, no-store`. The list route
  exposes projections only; opening one incident is a separate decrypted and
  audited action.
- Audit allowed and denied center/read/create/follow-up/resolution actions.
  Audit details contain type, severity, session, counts, and versions only,
  never narrative text, care details, or guardian identity.

## Consequences

- A database or backup disclosure does not reveal incident narratives without
  the application keyring.
- The timeline can grow without rewriting prior notes. V1 deliberately does not
  support editing or deleting entries.
- Guardian notification is recorded but not sent automatically. Production
  email policy, emergency escalation, and provider delivery remain separate
  work.
- The log is an operational record, not a claim of HIPAA compliance or a
  replacement for emergency services, mandated external reporting, or an
  electronic medical-record system.

## Alternatives Considered

- Store incidents as general camper notes: rejected because ordinary profile,
  roster, and reporting access is too broad.
- Reuse form submissions: rejected because forms describe parent-provided
  readiness, not a staff-authored chronological event.
- Keep a single editable encrypted incident document: rejected because edits
  would obscure the original report and intermediate follow-up actions.
- Permit ordinary camp staff: rejected because incident narratives require a
  narrower privileged and MFA-verified operational boundary.

## Revisit When

Revisit for correction workflows, external-reporting rules, guardian
notification delivery, attachments, medication-administration linkage,
retention/deletion policy, KMS-backed encryption, and clinical printouts.
