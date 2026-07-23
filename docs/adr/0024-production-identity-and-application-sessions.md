# ADR 0024: Production Identity and Application Sessions

## Status

Accepted

## Context

Local request headers helped build the family and tenant authorization model,
but they are not an authentication system. Parent access must distinguish an
application account from an adult contact record, while workforce access needs
stronger assurance, revocation, and organization-specific roles.

Cognito email OTP cannot be combined with pool-wide required MFA, and hosted
signup introduces provider-owned signup behavior that does not fit organization
approval and existing-family invitation rules.

## Decision

Keep canonical accounts, organization memberships, opaque sessions,
invitations, onboarding requests, and authorization policy in the application.
`RequestIdentity.subject` remains the canonical application account ID and
existing `adults.identity_subject` values are preserved.

Use a provider-neutral `IdentityProvider` boundary:

- Amazon Cognito is the first production adapter.
- A deterministic local adapter exercises the same challenge state machine
  without AWS and cannot run in production.
- Parents use email OTP. Workforce and dual-role accounts use password plus
  TOTP. Cognito MFA is optional at pool level and mandatory in application
  policy for privileged memberships.
- Provider tokens are discarded after an opaque `camp_session` cookie is
  established. Short-lived provider state and queued invitation content are
  AES-GCM encrypted with a versioned auth keyring.
- Session, invitation, and challenge secrets are stored only as SHA-256 hashes.
- Tenant authorization is rebuilt from active membership and adult-link state
  on each request. A pending family applicant receives status-only access.
- Login email changes require a fresh OTP challenge for the new address and do
  not mutate the corresponding adult contact email.
- Production startup rejects local header authentication, the local provider,
  or a missing auth encryption keyring.

## Consequences

Another provider can be added without moving family or workforce authorization
into provider groups. Organization disablement does not disable the same
account elsewhere, while global suspension revokes all application and provider
sessions.

The API owns more lifecycle code and must keep provider challenge transitions,
session policy, audit redaction, key rotation, invitation expiry, and recovery
tests current. Cognito Essentials and SES are production prerequisites, but
local development and tests require no AWS resources.
