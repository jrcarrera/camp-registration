# ADR 0004: Health and Safety Data Separation

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-003

## Context

Camper health and safety information is Restricted data. Combining it with core
camper demographics makes least-privilege access, encryption, retention, and
auditing harder to enforce.

## Decision

Restricted health and safety data must be stored separately from core camper
demographic records. Separate tables and a dedicated domain boundary are
required; a separate database is not required for the MVP.

Restricted fields require application-layer authenticated encryption, tenant
RLS, and explicit authorization. Health and safety rows retain a non-null
`organization_id` and a constrained relationship to the camper record.

## Consequences

- Ordinary camper and roster queries do not return Restricted health fields.
- Decryption is performed only by an authorized health-data operation.
- Search, sorting, and reporting over encrypted fields require separate security
  review.
- Prohibited medical-record, insurance, government, and payment-card identifiers
  remain outside the MVP data model.

## Alternatives Considered

- Store health fields directly on camper records: rejected because it broadens
  routine access to Restricted data.
- Use a separate database immediately: rejected because it adds operational
  complexity without removing the need for authorization, encryption, and audit.

## Revisit When

Revisit if regulatory or operational requirements require a separately operated
health-data store or independently managed encryption boundary.
