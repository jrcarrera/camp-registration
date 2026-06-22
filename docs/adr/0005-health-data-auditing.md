# ADR 0005: Health and Safety Access Auditing

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-004

## Context

Restricted health and safety data requires accountability beyond ordinary
application logs. Audit records must show who attempted an operation and its
outcome without copying sensitive contents into the audit system.

## Decision

Every read, decryption, download, modification, export, authorization denial,
and break-glass access involving Restricted health and safety data must produce
a structured audit event.

Audit events contain actor or service identity, organization scope, action,
target identifier, database-generated time, request correlation, and outcome.
They must contain metadata only and never include health contents, document
contents, secrets, tokens, or full request bodies.

## Consequences

- Health-data services cannot return decrypted data before recording the required
  audit event as part of the operation's reliable execution path.
- Audit storage is append-only to ordinary application roles and is separately
  authorized.
- Tests must cover successful, denied, exported, and break-glass access events.

## Alternatives Considered

- Log modifications only: rejected because reads and downloads are material
  disclosures.
- Use general application logs: rejected because they lack the required
  structure, retention, and access restrictions.

## Revisit When

Revisit when a tamper-evident archive is implemented or legal requirements
change event retention and review obligations.
