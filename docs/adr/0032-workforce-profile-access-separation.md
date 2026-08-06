# ADR 0032: Workforce Profile and Access Separation

## Status

Accepted

## Context

Camp operations need a small, tenant-owned roster of staff and volunteers with
session positions. An application membership answers who may use the system;
it does not establish employment, volunteer approval, qualifications, or
screening. Conversely, an operational profile must not create or revoke
application access.

The roster includes limited contact information for administrators, while camp
staff only need operational assignment details. The domain must remain outside
applicant tracking, HR, payroll, background-check, training, medical, and
timekeeping scope.

## Decision

- Keep `workforce_profiles` separate from `user_accounts` and make account
  links optional, unique per organization, and resolved server-side only from
  normalized email plus an active same-organization membership.
- Treat `STAFF` and `VOLUNTEER` as workforce types, never platform roles.
  Workforce status never grants, changes, or revokes membership access.
- Restrict profile/contact administration and assignments to MFA-verified camp
  or organization administrators. Give camp staff a separate contact-free
  session roster projection only.
- Retain profile and assignment history with lifecycle/cancellation states and
  optimistic versions; no runtime delete grant exists.
- Bound assignments to tenant-owned session dates, force tenant RLS, use
  `private, no-store` responses, and audit only IDs, states, counts, and other
  operational metadata without names, contacts, positions, or raw searches.

## Consequences

Identity administration remains the only place to grant or revoke application
roles. Operators get a focused roster without accumulating excluded HR data,
and future scheduling may reference the tenant-safe workforce assignment
boundary without inheriting personal contact or access-management behavior.
