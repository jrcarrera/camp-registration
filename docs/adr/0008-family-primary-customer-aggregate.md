# ADR 0008: Family Is the Primary Customer Aggregate

- Status: Accepted
- Date: 2026-06-23
- Decision owners: Project owner

## Context

Camp registration is usually performed by a household, not by an individual
camper. One family may register multiple children, manage multiple adults or
guardians, reuse emergency and pickup contacts, pay shared invoices, receive
family-level discounts, and return year after year.

A camper-first model would make early screens feel simple, but it would push
household permissions, sibling checkout, shared balances, and returning-family
management into later workarounds.

## Decision

Model Family as the primary customer/account aggregate.

The domain language is:

- The Family is the customer.
- The Camper is the participant.
- The Adult is the account holder.

The parent portal and family management workflows must use the family as the
primary navigation and ownership context.

## Consequences

- Adults, campers, contacts, registrations, invoices, and payment history can be
  organized around the family.
- Multi-camper registration and checkout can be designed as first-class flows.
- `family_id` becomes a core foreign key for family-owned records.
- Implementation work must not treat camper records as customer accounts.
- Staff tooling may still search by camper, adult, session, or invoice, but
  ownership remains family-centered.

## Alternatives Considered

- Camper as the primary customer aggregate: rejected because it makes sibling
  checkout, shared balances, adult permissions, and returning-family management
  harder to model correctly.
- Adult as the primary customer aggregate: rejected because family membership,
  split households, shared campers, and shared payment history do not belong to
  a single adult profile.

## Revisit When

Revisit if the product adds non-family institutional customers or camper-managed
accounts that require a different ownership model.
