# ADR 0031: Public catalog is a dedicated, cached projection

## Status

Proposed pending database and browser verification.

## Decision

`GET /v1/public/organizations/:organizationSlug/catalog` reads a dedicated
allowlist from `get_public_catalog(text)`. The SQL function is `SECURITY
DEFINER`, has an explicit `pg_catalog` search path, is executable only by
`camp_app`, and filters both the requested slug and the explicit public
publication switch. Unknown and disabled organizations deliberately share a
404/no-store response.

The projection exposes presentation text, published catalog fields, the
separate family-request flag, registration state, and a four-value availability
band. It never returns enrollment, roster, family, camper, waitlist, hold,
payment, health, or organization-ID data. The availability calculation mirrors
the command boundary by reserving confirmed registrations, live pending offers,
and active capacity holds without returning a count.

Successful reads may be cached for 60 seconds with a 300-second stale window.
Anonymous reads are not audited. Organization settings writes retain the
existing `camp_admin` and `organization_admin` convention and add a redacted
`organization.public_catalog_updated` audit event containing only changed
field names and the enabled flag.

## Consequences

The authenticated household cart remains the only registration command path;
public calls-to-action only link to sign-in or the existing family-account
request flow. There is no general GET rate limiter in the current API process;
this remains a production edge/WAF concern rather than a misleading in-memory
limiter. Public preview for disabled catalogs requires a separately authorized
read path before this ADR can be accepted.
