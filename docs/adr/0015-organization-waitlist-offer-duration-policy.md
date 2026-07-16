# ADR 0015: Organization Waitlist Offer Duration Policy

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Project maintainers

## Context

Automated waitlist offers used a deployment environment variable while staff
offer creation defaulted independently to 48 hours in the API and web UI. Two
organizations sharing one deployment could not have different claim windows,
and changing a deployment value did not give administrators a visible source
of truth.

The product already supports explicit per-offer overrides. The missing decision
is where the normal operating default belongs and how it is changed safely.

## Decision

- Store `waitlist_offer_duration_hours` on each organization, protected by the
  existing organization tenant boundary and a column-limited runtime update
  grant.
- Allow the supported operating values of 24, 48, 72, and 168 hours. Existing
  organizations start at 48 hours.
- Use the organization value whenever offer creation does not provide an
  explicit duration. The database resolves that default in the same transaction
  that locks the session and creates the offer.
- Remove the worker deployment setting for offer duration. Every worker-created
  offer uses its tenant's current organization policy.
- Add an administrator settings API and web page. Changes are recorded as
  `organization.settings_updated` audit events with previous and new values.
- Keep explicit per-offer staff overrides and record whether each offer used
  the organization default or a staff override in its creation audit event.

## Consequences

Organizations in one deployment can use different claim windows without
restarting workers. Administrators can see and change the source of truth, and
the staff offer control clearly distinguishes the organization default from a
one-off override.

The initial policy is organization-wide. Camps that need different defaults by
program, session, or season must continue to use one-off overrides until a
clearer precedence model is defined.

## Alternatives Considered

- Keep the environment variable: rejected because it is deployment-wide and
  invisible to organization administrators.
- Store the default on every session: rejected because it adds repetitive data
  and unclear inheritance before a session-specific policy is required.
- Remove per-offer overrides: rejected because operators still need a bounded
  exception path for unusual circumstances.

## Revisit When

Revisit when operators require program-, season-, or session-specific defaults,
or when claim windows must support arbitrary values instead of the supported
operating choices.
