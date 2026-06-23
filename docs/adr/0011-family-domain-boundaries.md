# ADR 0011: Family Domain Is Separate from Registration, Health, and Finance

- Status: Accepted
- Date: 2026-06-23
- Decision owners: Project owner

## Context

Family management, registration, health records, and finance have different
workflows and controls. Combining them too early would make the system harder to
reason about as camps add returning families, waitlists, forms, medical records,
scholarships, refunds, discounts, and payment reconciliation.

The MVP architecture direction is an API-driven modular monolith. Clear domain
boundaries do not require distributed services.

## Decision

Keep family records, registration/enrollment, health records, and finance
records in separate domain modules.

The initial domain separation is:

- Identity: user accounts and authentication state
- Family: family units, adults, campers, and contacts
- Programs: camps, sessions, seasons, weeks, and capacity
- Registration: enrollments, holds, waitlists, and eligibility checks
- Health: medical forms, medications, allergies, and medical documents
- Finance: invoices, payments, refunds, credits, and payment references

## Consequences

- APIs, services, tests, and future database ownership are organized by domain
  boundary.
- Cross-domain workflows use explicit integration points instead of shared
  mutable data structures.
- Audit, retention, and authorization rules can differ by domain.
- Implementation takes slightly more planning up front, but avoids a tightly
  coupled parent portal and registration model.
- Agentic implementation tasks should build vertical slices by domain and call
  out cross-domain assumptions explicitly.

## Alternatives Considered

- One combined family-registration-health-finance module: rejected because it
  would mix unrelated access, retention, audit, and workflow rules.
- Separate deployable services for each domain during MVP: rejected because the
  modular monolith can preserve boundaries without distributed-system overhead.

## Revisit When

Revisit when independent team ownership, scaling, compliance, or deployment
needs require separating a domain into a distinct service or database boundary.
