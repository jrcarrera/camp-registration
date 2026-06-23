# ADR 0009: Adults Hold Access; Campers Do Not Authenticate

- Status: Accepted
- Date: 2026-06-23
- Decision owners: Project owner

## Context

Permissions, account recovery, registration authority, payments, and family
record management belong to adults. Campers are children whose records need
privacy and safety controls. Authenticating campers during the MVP would add
privacy, authorization, account recovery, and consent complexity without a clear
MVP benefit.

## Decision

Adults may be linked to identity accounts. Campers are not login principals
during the MVP.

Camper records are managed by authorized adults and staff according to explicit
permissions.

## Consequences

- Adult permissions must be explicit and must not be inferred only from a family
  relationship.
- The identity domain remains separate from the adult profile domain.
- Parent, guardian, staff, organization admin, and system admin access can be
  modeled without creating camper user accounts.
- Non-login contacts must be visibly different from adults with account access
  in the web UI.
- Any future camper login capability requires a new decision record.

## Alternatives Considered

- Create login accounts for campers during MVP: rejected because it adds child
  privacy, consent, account recovery, and authorization complexity without a
  required registration workflow.
- Treat adult profile records as identity accounts: rejected because identity is
  provider-backed authentication state, while adult profiles are family-domain
  records.

## Revisit When

Revisit if the product adds camper self-service features, teen program portals,
or consent workflows that require camper authentication.
