# ADR 0007: Workload and Database Permissions

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-006

## Context

Shared owner-level credentials increase the impact of an application,
background-job, deployment, or operational compromise. The modular monolith does
not require microservices, but distinct workloads still require only the
permissions needed for their function.

## Decision

Production workload identities and database roles must use least privilege and
be separated where permissions differ. Migration, runtime, worker, backup, and
emergency access must not share owner-level credentials.

ECS task roles must grant only the AWS actions and resources required by the
deployed workload. PostgreSQL runtime and worker roles must not own tables, be
superusers, or bypass RLS. Migration credentials are used only by an explicit
migration operation and are never provided to normal API tasks.

Role separation follows actual permission boundaries and does not require
splitting the modular monolith into independent services.

## Consequences

- Infrastructure defines separate task and database roles where permissions
  differ.
- Secrets are stored and rotated independently by role.
- Local development must model separate migration and runtime database roles
  before the first domain schema migration is introduced.
- Permission-denial tests are required for runtime and worker roles.

## Alternatives Considered

- One shared owner credential: rejected because an application compromise would
  bypass database security controls.
- A separate service for every permission boundary: rejected because role and
  task separation can provide least privilege without premature service sprawl.

## Revisit When

Revisit when deployment boundaries or workload responsibilities change. Broader
permissions require evidence and a superseding ADR.
