# ADR 0017: Provider-Backed Deposit Reconciliation

- Status: Accepted
- Date: 2026-07-18
- Decision owners: Project owner
- Related: ADR 0006, ADR 0007, ADR 0012

## Context

The registration ledger already owns immutable price and deposit snapshots,
offline payment records, and computed balances. Parents need to pay a deposit
online without allowing provider callbacks, retries, or stale events to create
duplicate or incorrect ledger entries. Each camp owns its payment-provider
account, while the platform supplies the application and integration.

## Decision

Use Stripe Checkout as the first production hosted payment provider behind an
internal provider interface. Store the camp's connected Stripe account ID as a
tenant-owned organization setting; keep the platform secret and webhook secret
in deployment configuration.

The server calculates the remaining deposit from the registration snapshot and
ledger. Each checkout request creates a tenant-owned payment attempt with a
client idempotency key. Stripe Checkout creation also uses the attempt ID as its
provider idempotency key.

Only a verified provider event may turn an attempt into an immutable
`ONLINE_CARD` ledger record. Provider event IDs and payment-attempt IDs are
unique. A successful state is terminal with respect to later failure or expiry
events, while a later success may recover an earlier pending, failed, or
cancelled attempt. The same transaction updates reconciliation state, inserts
the ledger record, writes an audit event, and queues the payment receipt.

A local-only provider adapter simulates the hosted redirect and completion path
without requesting card details. It is enabled explicitly by local environment
configuration and is not a production payment mechanism.

## Consequences

- Raw card data never enters the web app, API, logs, audit records, or database.
- Parent payment authorization uses linked-adult `account_owner` or
  `can_make_payments` permission.
- Staff receive a tenant-scoped reconciliation queue with internal and provider
  references.
- Production requires platform Stripe credentials, a Connect webhook endpoint,
  and a connected account ID for each enabled camp.
- Refunds, full-balance payments, saved methods, ACH, installments, application
  fees, coupons, and settlement reporting remain separate future decisions.

## Alternatives Considered

- Add payment rows immediately after browser redirect: rejected because redirects
  are not authoritative and may be skipped or replayed.
- Trust a client-provided amount: rejected because the registration snapshot and
  ledger are the source of truth.
- Store a provider checkout session without a separate attempt/event model:
  rejected because it cannot safely represent retries, duplicates, and
  out-of-order callbacks.

## Revisit When

Revisit when the product adds refunds, installment schedules, saved payment
methods, another provider, or platform fee collection.
