# ADR 0003: Tenant-Owned Table Requirements

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-002

## Context

Tenant ownership must be directly enforceable and testable. Requiring an
organization identifier on genuinely global data would create false ownership,
duplicate identifiers, and ambiguous policies.

## Decision

Every tenant-owned row must contain a non-null `organization_id`. Foreign keys
and composite constraints must prevent references across organizations.

Global tables must be explicitly classified and documented, contain no
tenant-owned data, and be tested as an exception. Valid global categories may
include the organization root record, global user identity, static reference
data, and database migration metadata. A table is not global merely because
multiple organizations use it.

Camp-owned and other subordinate rows must carry `organization_id` even when it
could be derived through another relationship when doing so is necessary for
direct RLS enforcement and cross-organization constraints.

## Consequences

- Schema review must classify each new table as tenant-owned or global.
- Tenant-owned unique constraints and relationships generally include
  `organization_id`.
- Global-table exceptions require focused tests proving they contain no tenant
  data.

## Alternatives Considered

- Require `organization_id` on every table without exception: rejected because
  global identities and reference data do not have one legitimate tenant owner.
- Derive all ownership through joins: rejected because it weakens direct RLS and
  database constraint enforcement.

## Revisit When

Revisit if the system adopts database-per-tenant isolation or introduces a new
class of shared data that cannot be safely classified under this rule.
