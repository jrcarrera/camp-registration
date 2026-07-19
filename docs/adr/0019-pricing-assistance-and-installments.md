# ADR 0019: Explainable Pricing, Assistance Awards, and Parent-Paid Installments

- Status: Accepted
- Date: 2026-07-19
- Decision owners: Project owner
- Related: ADR 0006, ADR 0008, ADR 0017, ADR 0018

## Context

Camp pricing needs flat session add-ons, conservative household discounts,
coupons, reviewed financial assistance, and installment schedules. Families and
staff must be able to explain a balance after configuration changes, retries, or
scholarship reservation and release.

## Decision

Snapshot add-ons and every adjustment on the household order and its lines.
Keep the registration's gross price intact; represent automatic discounts,
coupons, and approved assistance as immutable ledger credits.

Price in this order: base tuition and add-ons, one highest-value automatic rule,
one normalized coupon, then approved financial assistance. Automatic-rule ties
use configured priority and stable identifier order. Discounts affect tuition
only and cannot make a line negative.

Financial-assistance applications keep the parent statement private from normal
parent responses and permit audited staff approval, denial, or revision. An
approval creates a bounded award. Order holds reserve award value, confirmation
consumes it, and expiration releases it.

Payment-plan templates consist of the deposit plus 2–6 dated percentages of the
remaining balance totaling 100%. Parents initiate a fresh hosted Checkout for
each installment. The platform stores no reusable payment method and performs
no off-session charge. Due and seven-day reminders use the notification outbox;
overdue installments do not cancel registrations.

## Consequences

- Historical orders remain explainable after policy edits or deactivation.
- Awards cannot be double-spent by concurrent carts.
- Installment rounding is deterministic, with the final installment receiving
  the remainder.
- Staff control pricing policy and assistance decisions while parents control
  when each hosted installment payment begins.

## Alternatives Considered

- Stack every qualifying discount: rejected because it makes totals less
  predictable and can over-discount tuition.
- Reduce the registration gross price in place: rejected because it obscures
  the financial explanation and audit history.
- Save cards and charge installments automatically: rejected because it expands
  payment-data and consent scope beyond the current product.

## Revisit When

Revisit for refunds, taxes, donations, inventory, add-on deposits, ACH, automatic
off-session billing, or more than one coupon per order.
