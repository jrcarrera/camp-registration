# ADR 0013: Waitlist Worker Uses Narrow Tenant Discovery and Persistent Health

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Project owner
- Supersedes: The explicit organization allowlist in ADR 0012

## Context

ADR 0012 required deployments to enumerate every organization in worker
configuration. That preserved row-level security, but a newly created or omitted
organization could silently miss offer expiry, queue advancement, and
notification delivery. The worker process also had no durable heartbeat, so a
running container was not evidence that tenant jobs were current.

The runtime database role must continue to avoid table ownership and RLS bypass.
Actual waitlist work must always execute with one explicit organization context.

## Decision

- Add an organization setting that enables waitlist automation by default.
- Discover enabled organization identifiers through a security-definer database
  function that returns identifiers only. Revoke public execution and grant the
  runtime role access to this narrow control-plane operation.
- Continue to set `app.organization_id` inside every tenant job transaction. The
  discovery function does not grant cross-tenant reads of registrations,
  offers, notifications, or worker status.
- Persist each tenant's cycle start, completion, success or failure, safe error
  code, and aggregate counters in an RLS-protected status row.
- Derive staff-visible health from PostgreSQL time, recent cycle completion,
  repeated cycle failures, terminal delivery failures, and expired pending
  offers.
- Make the container health command fail when an enabled tenant has never run,
  has a stale heartbeat, or has a failed cycle. Delivery dead letters degrade
  staff-visible health but do not restart an otherwise functioning worker.

## Consequences

- New organizations participate automatically unless automation is explicitly
  disabled by the control plane.
- The worker can be monitored without adding a fake HTTP server to the process.
- Organization identifiers are visible through one audited schema boundary;
  tenant-owned product data remains protected by service authorization and RLS.
- The current organization table does not yet expose lifecycle management in
  the product UI. A future organization suspension workflow must disable
  waitlist automation in the same authoritative transaction.
- Status is a latest-cycle heartbeat, not an unlimited execution log. External
  metrics may retain longer history when production observability is added.

## Alternatives Considered

- Continue using an environment allowlist: rejected because configuration drift
  can silently omit tenants.
- Give the worker a `BYPASSRLS` role: rejected because it weakens the primary
  tenant isolation invariant.
- Add a network control-plane service for tenant scheduling: deferred because a
  narrow database function is simpler, portable, and sufficient for the MVP.
