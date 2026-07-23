# ADR 0023: Restricted Health Records v1

- Status: Accepted
- Date: 2026-07-22
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0004, ADR 0005, ADR 0007, ADR 0009, ADR 0010

## Context

Campers need pre-arrival allergy, medication, immunization, dietary,
accessibility, emergency-instruction, and private-document-reference records.
These values are Restricted data. Adding them to camper profiles, readiness
responses, ordinary reports, or general form answers would broaden plaintext
access beyond health operations and parent ownership.

## Decision

- Store one tenant-owned health aggregate per camper in
  `camper_health_records`. Persist an AES-256-GCM ciphertext, nonce,
  authentication tag, and key version. Bind authenticated encryption to the
  organization and camper identifiers so ciphertext cannot be moved between
  records.
- Configure a versioned keyring outside source through
  `HEALTH_DATA_ENCRYPTION_KEYS` and select the write key with
  `HEALTH_DATA_ACTIVE_KEY_VERSION`. Retain an encryption-provider interface so a
  production KMS-backed adapter can replace local key material.
- Keep only minimum operational projections in plaintext: review state,
  immunization state, and booleans indicating allergies, medications, dietary
  needs, accessibility needs, or emergency instructions. Ordinary camper,
  roster, and reporting queries continue to exclude health details.
- Introduce the explicit `health_staff` role. Health staff and organization
  administrators with MFA may routinely decrypt, edit, review, and export
  records. Parents may read, edit, and submit records only for campers owned
  through a linked adult with family-management authority.
- Camp administrators can see the projection-only review queue. Plaintext
  access requires the explicit break-glass query and one of the constrained
  reason codes. A break-glass request never accepts free text.
- Record successful and denied center/read/write/submit/review/export and
  break-glass activity in append-only `audit_events`. Audit details contain
  operational metadata only, never health contents, document references, or
  request bodies.
- Parent edits return a record to draft. Parents submit for review; authorized
  staff approve or request changes with a parent-visible message stored inside
  the encrypted payload.
- Document support in v1 is an encrypted reference to private storage, not a
  public URL or file upload. Medication administration, nurse notes, incidents,
  bulk rounds, and medical printouts remain later health-center slices.
- Generate a separately authorized, audited, private/no-store health CSV. It is
  not part of the general reporting center.

## Consequences

- A database disclosure does not reveal health contents without the configured
  application keyring, while tenant RLS remains a second boundary.
- Search and staff queues use deliberately coarse projections. Opening a record
  is a distinct audited disclosure.
- Key rotation can move writes to a new version while old versions remain
  readable. Re-encryption jobs and production KMS envelope keys remain future
  operational work.
- The MVP does not claim HIPAA compliance or collect medical-record, insurance,
  government, or payment identifiers.

## Alternatives Considered

- Add health fields to `campers`: rejected because every roster and family
  profile query would become a Restricted-data path.
- Store plaintext JSON behind RLS: rejected because RLS does not protect
  database backups, administrators, or accidental broad query projections.
- Use form submissions for health answers: rejected because general form access
  and reporting do not have the health-specific authorization and auditing
  contract.
- Allow arbitrary break-glass explanations: rejected because free text can copy
  health details into the audit system.

## Revisit When

Revisit for KMS envelope-key production rollout, re-encryption jobs, retention
and deletion policy, private document upload/download, medication
administration, incident workflows, clinical print projections, or regulatory
requirements for a separately operated health-data store.
