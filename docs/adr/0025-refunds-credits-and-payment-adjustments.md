# ADR 0025: Refunds, Credits, and Payment Adjustments

- Status: Accepted
- Date: 2026-07-23
- Decision owners: Project owner
- Related: ADR 0006, ADR 0017, ADR 0019, ADR 0024

## Context

Camp finance teams need to correct balances and return settled card funds
without editing payment history or handling card data. A provider refund and a
balance correction are different accounting events: returning money should not
silently recreate a family balance, while a credit or charge must immediately
change the amount due.

## Decision

Store every credit, charge, and refund as an immutable tenant-owned payment
adjustment with a required reason, actor, idempotency key, status, and audit
event. Introduce a dedicated `finance_staff` role; finance staff, camp
administrators, and organization administrators may create adjustments.

Credits and charges post signed compatibility entries to the existing
per-registration ledger. Credits are bounded by the current balance and reduce
it; charges increase it. Refunds reference one successful provider payment and
one of its registration allocations. They are bounded by the remaining
unrefunded allocation and do not independently change the registration balance.
A related credit must be recorded explicitly when policy requires a balance
reduction.

Create provider refunds through the original connected account and payment
intent. Use the adjustment identifier as the provider idempotency key, retain
pending and failed states, and reconcile Stripe refund webhooks idempotently.
Successful refunds queue a family notification with the provider refund
reference. Card data remains entirely with the provider.

## Consequences

- Finance history is append-only and reasons remain attributable.
- Partial refunds can be issued safely against household-payment allocations.
- Retried requests and repeated provider events do not duplicate money movement.
- Families see corrected balances immediately and receive a successful-refund
  notice.
- Refund policy remains an organizational decision; the application enforces
  settlement and allocation limits, not policy eligibility.

## Alternatives Considered

- Edit or delete original payments: rejected because it destroys reconciliation
  evidence.
- Treat every refund as a negative payment: rejected because it can incorrectly
  recreate a family balance without an explicit pricing decision.
- Let all camp staff adjust money: rejected because routine operational access is
  broader than the finance duty.

## Revisit When

Revisit for policy-driven cancellation fees, unapplied household credits,
cross-registration transfers, provider disputes, settlement batches, taxes, and
general-ledger exports.
