# Family Domain MVP Implementation Plan

- Status: Family and waitlist operational slices implemented
- Date: 2026-06-23
- Source: Internal `product-strategy/FAMILY_DOMAIN_MODEL.md`
- Related ADRs:
  - [ADR 0008: Family Is the Primary Customer Aggregate](adr/0008-family-primary-customer-aggregate.md)
  - [ADR 0009: Adults Hold Access; Campers Do Not Authenticate](adr/0009-adults-hold-access-campers-do-not-authenticate.md)
  - [ADR 0010: Camper Profile and Health Data Boundary](adr/0010-camper-profile-health-data-boundary.md)
  - [ADR 0011: Family Domain Boundaries](adr/0011-family-domain-boundaries.md)

## Goal

Implement the first API-driven family-management slice so staff can create and
manage family household records, adults, campers, and contacts without mixing
health data into camper profile records.

## Scope

Implemented in this slice:

- Family, adult, camper, and contact contracts
- REST API endpoints under `/v1/families`
- PostgreSQL tables with `organization_id`, RLS, and runtime grants
- Optimistic version checks for updates
- Audit events for family-domain writes
- Parent-owned family filtering and parent registration authorization through
  linked adult `identity_subject`
- Parent-style checkout, registration cancellation, and time-boxed waitlist
  offers with self-service acceptance or decline
- Admin-only audited waitlist reordering with multi-camper block movement
- Web UI for listing families, creating families, and editing nested records
- Route and database tests for family behavior
- OpenAPI and generated TypeScript API types

## Implementation Steps

1. Define shared family-domain request and response schemas in
   `packages/contracts`.
2. Add a forward-only family database migration with tenant-owned tables,
   RLS policies, indexes, and least-privilege grants.
3. Add a `FamilyStore` with tenant context, optimistic updates, and audit-event
   writes.
4. Add a `FamilyService` and Fastify routes for list, detail, create, and nested
   record updates.
5. Regenerate OpenAPI and generated API types.
6. Add family list, create, and detail management screens in the web app.
7. Add targeted integration and route tests.
8. Rebuild the local Docker stack and verify the pages against real API/database
   data.

## Deferred

- Parent self-service onboarding beyond local/domain claim support
- Adult invite, identity-unlink, account recovery, and provider-backed
  identity-management workflows
- Family merge, split, transfer, archive, and restore workflows
- Health forms, medications, allergies, and medical documents
- Online payments, sibling atomic checkout groups, SMS, bounce processing, and
  production tenant scheduling for waitlist automation
- Restricted pickup rules and custody-sensitive workflows
