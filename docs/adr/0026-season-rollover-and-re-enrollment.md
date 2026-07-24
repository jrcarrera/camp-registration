# ADR 0026: Season Rollover and Returning-Family Re-enrollment

- Status: Accepted
- Date: 2026-07-24
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0008, ADR 0018

## Context

Camp operators repeat much of the same program and session setup each year,
while returning families already have camper profiles and confirmed
registration history. Re-entering both sides increases setup time and makes it
easy to introduce inconsistent dates, prices, or eligibility rules.

## Decision

Treat season rollover as one tenant-scoped transaction. An organization or camp
administrator creates a new season from an existing one; active source sessions
are copied with the same program, duration, capacity, eligibility, pricing,
deposit, and waitlist settings. Calendar dates and registration timestamps move
by the season-year difference, codes replace the source year when present, and
every copied session starts in `DRAFT`.

Persist the source and target season relationship plus every source-to-target
session mapping. Record one structured `season.rolled_over` audit event with the
actor, request, source, target, and copied-session count. Do not copy
registrations, orders, payments, attendance, housing placements, form
submissions, assistance awards, or health records.

Use the mapping to offer returning families a shortcut only when the camper had
a confirmed source registration, the target session is published, its
registration window has not closed, and the camper does not already have an
active target registration. The shortcut preselects the camper and target
session in the existing household cart; normal ownership, registration-window,
eligibility, duplicate, capacity, pricing, payment, and waitlist checks remain
authoritative.

## Consequences

- Operators can prepare the next cycle without recreating each session.
- Draft-by-default copying creates an explicit review gate before families see
  the new catalog.
- Returning families skip navigation and re-entry but do not receive a reserved
  seat or bypass current rules.
- Durable mappings support future cross-season analytics without inferring
  relationships from names or program codes.

## Alternatives Considered

- Publish copied sessions immediately: rejected because shifted dates, prices,
  capacity, and policies require operator review.
- Copy registrations into the new season: rejected because it would bypass
  family intent, current eligibility, availability, price acceptance, and
  payment.
- Match returning sessions by name or program alone: rejected because those
  attributes are editable and may not identify an intentional rollover.

## Revisit When

Revisit for configurable copy scopes, bulk publish review, saved cross-device
carts, policy-driven cancellation transfers, or returning-family profile-change
attestation.
