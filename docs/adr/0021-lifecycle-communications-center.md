# ADR 0021: Lifecycle Communications Center

- Status: Accepted
- Date: 2026-07-22
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0012, ADR 0014, ADR 0016

## Context

Waitlist, order, payment-receipt, and installment email already use a durable
tenant-scoped outbox and retrying worker. Staff still need to communicate about
forms, balances, arrival, and other registration lifecycle events without
exporting addresses or rebuilding recipient lists outside the application.

The first communication center must support reusable content, operational
audience selection, scheduled delivery, failure visibility, and replay without
turning the transactional worker into a marketing or emergency-broadcast
system.

## Decision

- Store tenant-owned plain-text templates with optimistic versions and explicit
  draft, active, and archived states.
- Support only documented merge variables. Render recipient-specific values
  when a campaign is queued and retain the snapshotted subject and body on the
  campaign and outbox record.
- Define four v1 audiences: confirmed registrations for a session, waitlisted
  registrations for a session, confirmed registrations missing assigned forms,
  and registrations with a balance due, optionally limited to one session.
- Select only active, non-archived adults who opted into operational
  communication and are an account owner or can register the family.
- Preview the current delivery count before scheduling. Re-evaluate the
  audience transactionally when the scheduled campaign is actually queued.
- Snapshot the active template at schedule time so later edits do not change an
  already scheduled message.
- Queue lifecycle messages into the existing notification outbox with a
  campaign link and recipient-level idempotency key. The shared worker discovers
  every tenant, queues due campaigns, and then delivers all pending outbox
  messages through the configured email adapter.
- Mask addresses in the delivery timeline. Administrators may replay only
  terminal failed deliveries, and every authoring, scheduling, cancellation,
  queueing, and replay action produces an audit event.
- Permit camp staff to read the workspace and preview audiences. Restrict
  template authoring, scheduling, cancellation, and replay to administrators.

## Consequences

- Camps can send targeted operational email without maintaining external
  spreadsheets of family addresses.
- Scheduled campaigns are explainable even after a template changes.
- Recipient consent and current registration state are checked by the server;
  the browser never supplies addresses.
- Delivery remains at-least-once. Deterministic message identifiers and outbox
  idempotency reduce duplicates, but a process failure after SMTP acceptance
  can still result in a repeated message.
- Production bounce, complaint, and suppression ingestion remains a provider
  prerequisite. Local development continues to use SMTP and Mailpit.

## Alternatives Considered

- Store arbitrary recipient addresses on a campaign: rejected because it would
  bypass family consent, tenant scope, and authoritative registration state.
- Render templates in the browser: rejected because recipient data and trusted
  merge values belong at the service and worker boundaries.
- Build HTML drag-and-drop marketing campaigns, open tracking, and
  unsubscribes in v1: deferred because operational communication is the current
  product need and has different consent and deliverability rules.
- Add SMS and emergency broadcasts to the email worker: rejected for v1 because
  they require separate provider, consent, escalation, and reliability policy.

## Revisit When

Revisit for production provider events and suppression lists, automatic
event-subscription rules, organization branding and HTML, SMS, emergency
broadcasts, parent communication preferences by channel, or marketing
analytics.
