# ADR 0006: Payment Data Boundary

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner
- Security decision: Security ADR-005

## Context

The application needs payment status and refund workflows without receiving or
storing raw payment-card data. Stripe is the selected MVP processor, while the
open-source architecture must avoid embedding Stripe behavior throughout domain
logic.

## Decision

Stripe-hosted payment flows are the only supported MVP payment mechanism. The
application must never receive or store a primary account number, card
verification value, or other raw card data.

Only non-sensitive Stripe references, amounts, and payment statuses may be
stored. Stripe integration remains behind a payment-provider interface. Webhook
signatures must be verified, and payment operations and webhook processing must
be idempotent.

## Consequences

- Payment forms post card details directly to Stripe-hosted surfaces.
- Application logs, analytics, audit events, and support tools never receive raw
  card details.
- Domain code depends on internal payment concepts rather than Stripe SDK types.
- Adding another processor requires a new ADR and provider adapter.

## Alternatives Considered

- Direct card collection: rejected because it materially expands security and
  PCI scope.
- Hard-code Stripe throughout the application: rejected because it weakens
  portability and testability.

## Revisit When

Revisit when a validated customer requirement justifies ACH, installments,
saved payment methods, or another processor.
