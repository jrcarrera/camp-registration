# ADR 0002: Tenant Isolation Enforcement

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-001

## Context

Tenant isolation is a primary security boundary. Application authorization is
necessary for role, relationship, and object-level decisions, but a missing
application filter must not expose another organization's database rows.
PostgreSQL RLS cannot protect tenant resources held by external systems such as
object storage or Stripe.

## Decision

Every tenant-owned PostgreSQL table must have row-level security enabled and
forced. The runtime database role must not own tables, be a superuser, or have
the `BYPASSRLS` attribute.

Application services must also perform authorization and explicit tenant
scoping. Application filtering must never be the sole tenant-isolation control.
RLS is the mandatory database enforcement boundary, while service authorization
handles capabilities, relationships, and object ownership.

Tenant context must be set transaction-locally. Policies must constrain reads
and writes with both `USING` and `WITH CHECK`. External tenant resources require
equivalent scope enforcement in their provider adapters and infrastructure
policies.

## Consequences

- Tenant-owned migrations require explicit RLS policies from their first release.
- The runtime role must remain separate from table-owning and migration roles.
- Tests must attempt cross-tenant reads and writes through application and direct
  repository paths.
- Connection-pool tests must prove that tenant context cannot leak between
  transactions.

## Alternatives Considered

- Application filtering only: rejected because one missed predicate can expose
  another tenant's data.
- RLS only: rejected because it cannot express all application relationships or
  protect resources outside PostgreSQL.

## Revisit When

Revisit only if the tenancy model or primary database changes. Any replacement
must preserve independently enforced application and storage boundaries.
