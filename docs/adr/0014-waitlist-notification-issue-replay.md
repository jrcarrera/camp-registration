# ADR 0014: Waitlist Notification Issue Tracking and Replay

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Project maintainers

## Context

The waitlist outbox already retries transient email failures and preserves
terminal failures, but staff could not see or act on those failures. A domain
transition could also produce no message when a family had no active adult who
was eligible and opted in to receive operational communication. That absence
was not durable, so it could not be distinguished from a successful enqueue.

Replay must stay tenant-scoped, avoid exposing full recipient addresses, and
must not let ordinary staff silently repeat family communications.

## Decision

- Define one tenant-safe database view for eligible waitlist notification
  recipients. Both initial enqueue and coverage replay use this rule.
- Record a durable, idempotent `notification_coverage_issues` row when a
  waitlist transition has no eligible recipient.
- Present open coverage issues and terminal `FAILED` outbox rows together in
  the staff waitlist operations response. Recipient addresses are reduced to a
  domain-only hint before leaving the database package.
- Permit camp and organization administrators to replay an issue with a
  required reason. Camp staff may inspect issues but cannot replay them.
- Re-evaluate current family eligibility for coverage replay. Keep the issue
  open when no recipient exists; otherwise create new outbox rows and resolve
  it.
- Reset a terminal delivery failure to `PENDING` with cleared lock and error
  state. Preserve the original outbox identity and template payload.
- Record every replay as `waitlist.notification_replayed` in the audit log.

## Consequences

Notification gaps and terminal failures are visible in the operational
dashboard and contribute to degraded health. Administrators have a controlled
recovery path without direct database access. Replays are deliberate rather
than automatic, so correcting an address or consent setting does not itself
send an old message.

The coverage table adds lifecycle state that must remain consistent with the
outbox and eligible-recipient rule. Current replay controls cover email only;
future channels will need channel-specific recipient hints and retry rules.

## Alternatives Considered

- Treat zero inserted outbox rows as success: rejected because it hides a
  family communication gap.
- Automatically replay after family contact edits: rejected because a contact
  change does not prove an old message is still appropriate.
- Create duplicate rows for failed-delivery replay: rejected because resetting
  the terminal row preserves its stable identity while the audit event records
  the previous attempt count.
- Expose full recipient email addresses: rejected because the operations view
  only needs enough context to distinguish the failure.

## Revisit When

Revisit when notifications support SMS or push channels, a dedicated queue
replaces PostgreSQL outbox replay, or policy requires approval by a second
administrator before repeating communications.
