# ADR 0012: Waitlist Automation Uses a Tenant-Scoped Worker and Transactional Outbox

- Status: Accepted
- Date: 2026-07-13
- Decision owners: Project owner

## Context

Time-boxed waitlist offers must expire and advance without a staff member
watching the queue. Offer messages must also survive process restarts and
temporary email-provider failures. Capacity, offer ordering, and deadlines are
database-authoritative and every tenant-owned row is protected by row-level
security.

Sending email inside a registration transaction would make SMTP availability
part of the capacity-allocation path. Scanning every tenant from the runtime
database role would also conflict with tenant isolation.

## Decision

Run waitlist automation in a separate API-package worker entrypoint.

- The worker receives an explicit organization allowlist and sets tenant context
  for every database transaction.
- PostgreSQL time, session row locks, registration queue positions, and active
  offers remain authoritative for expiry and advancement.
- Camp and organization administrators may replace a session's queue order. The
  request includes the order originally loaded, the desired order, and a reason;
  the database rejects stale lists, rewrites every position atomically, and
  records both orders in the audit event.
- Offer state changes enqueue template-based messages in
  `notification_outbox` in the same transaction as the domain change.
- Delivery workers claim rows with `FOR UPDATE SKIP LOCKED`, recover abandoned
  claims, retry with capped exponential backoff, and retain terminal delivery
  history.
- Idempotency keys prevent duplicate outbox rows. A deterministic email
  `Message-ID` reduces duplicate delivery risk when an SMTP result is ambiguous.
- SMTP is behind an email-sender interface. Local development uses Mailpit;
  production can change providers without changing waitlist domain logic.
- Automated audit events use the dedicated `system:waitlist-worker` actor.

## Consequences

- Registration and capacity transactions do not wait on SMTP.
- Multiple worker replicas may safely claim different messages.
- Worker deployment must supply an explicit tenant list until a production
  control plane can schedule one tenant-scoped job per organization.
- Email delivery is at-least-once. A crash after SMTP accepts a message but
  before the outbox is marked delivered can still produce a duplicate.
- Recipient addresses and minimum template data are operational personal data
  stored in the outbox and must follow normal retention and access controls.
- Manual grouping is positional: selected campers are made adjacent, but this
  does not create an all-or-none capacity or offer group.

## Alternatives Considered

- Send email inline during offer creation: rejected because provider latency or
  failure would hold capacity locks and roll back otherwise valid offers.
- Let the runtime role discover every organization: rejected because it weakens
  the tenant-isolation model.
- Add a separate queue service for the MVP: rejected because PostgreSQL already
  provides durable transactions, locking, retry scheduling, and local
  portability.

## Revisit When

Revisit when production tenant scheduling, delivery volume, bounce processing,
or cross-domain notification demand justifies a dedicated queue or notification
service.
