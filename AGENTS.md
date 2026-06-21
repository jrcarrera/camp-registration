# Camp Registration Engineering Guide

## Product Direction

- Build a hosted SaaS first while preserving self-hosting portability.
- Keep the application API-driven. Browser and administrative clients use the
  documented REST API rather than direct database or framework-only paths.
- Production targets AWS, but local development and tests must not require AWS.
- Prefer a modular monolith and proven infrastructure over premature services.

## Repository Structure

- `apps/web`: responsive Next.js browser application
- `apps/api`: Fastify REST API and background worker entrypoints
- `packages/contracts`: shared schemas and generated OpenAPI types
- `packages/database`: PostgreSQL schema, migrations, and data access
- `packages/auth`: provider-neutral identity and authorization interfaces
- `packages/testing`: shared test helpers
- `docs/adr`: accepted architecture decision records
- `infra/terraform`: inactive until the production-readiness gate is approved

## Required Commands

Run from the repository root:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Use `pnpm dev:local` to build and run the full local stack. Do not introduce a
workflow that requires paid AWS resources for MVP development or testing.

## Security Invariants

- Deny authorization by default and validate it on every request and object.
- Never trust client-provided tenant, role, ownership, capacity, price, or time
  values.
- Every tenant-owned database row has a non-null `organization_id`.
- Enforce tenant scope in the service layer and PostgreSQL row-level security.
- The runtime database role must not own tables or bypass RLS.
- Privileged actions and Restricted-data access produce structured audit events.
- Do not log secrets, tokens, form answers, health data, raw payment data, or
  request bodies that may contain them.
- Children are records, not authenticated users, during the MVP.
- The application never receives raw payment-card details.
- PostgreSQL is authoritative for capacity, holds, ordering, and time.
- Restricted health fields require application-layer authenticated encryption.
- Background handlers and webhooks are idempotent and safe for repeated delivery.

## Change Rules

- Keep domain logic out of route handlers, React components, and provider
  adapters.
- Keep AWS, Stripe, email, storage, and identity integrations behind interfaces.
- Add dependencies only when they remove meaningful implementation or security
  risk. Prefer maintained, focused packages.
- Database migrations are forward-only. Never rewrite an applied migration.
- Add or update tests with every behavior change, especially authorization,
  tenant isolation, capacity allocation, audit events, and data classification.
- Record durable architectural changes in `docs/adr`.
- Preserve Apache-2.0 notices and use DCO signoff for contributions.

## Verification Expectations

- Narrow changes: run the affected package tests plus lint and typecheck.
- Shared contracts, database, authentication, or security changes: run the full
  required command set.
- Frontend changes: verify desktop and mobile layouts in the browser and check for
  overflow, overlap, inaccessible controls, and console errors.
- Never mark work complete when required services or verification commands are
  still running.
