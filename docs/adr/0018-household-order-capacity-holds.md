# ADR 0018: Household Orders and Provider-Gated Capacity Holds

- Status: Accepted
- Date: 2026-07-19
- Decision owners: Project owner
- Related: ADR 0003, ADR 0008, ADR 0012, ADR 0017

## Context

Parents need to register several existing-family campers across several sessions
and make one deposit payment. Creating each registration independently can leave
a household with partial, stale, or overbooked results. A provider checkout can
remain payable after the application's shorter capacity deadline.

## Decision

Use a tenant-owned `household_orders` aggregate with immutable order lines,
payment allocations, and 10-minute capacity holds. The browser may quote a cart
without writing data. Submission revalidates every line and locks sessions in
stable identifier order before creating any order state.

Individual-outcome orders hold available lines and immediately create
registrations for independently waitlisted lines. Keep-together orders either
hold all lines or create registrations sharing one durable waitlist group.
Grouped offers are created, accepted, declined, and expired as one unit.

One order payment attempt snapshots a per-line allocation. A verified successful
provider event creates each confirmed registration and its ledger payment in the
same transaction. Duplicate or out-of-order events cannot duplicate allocations.

Application holds expire after 10 minutes. Stripe Checkout retains its supported
30-minute configured expiry, but the billing worker explicitly expires the
provider session at the application deadline before releasing capacity. The
local provider implements the same interface without collecting payment data.

## Consequences

- Capacity and price remain server authoritative.
- Invalid lines reject the complete submission without partial state.
- A household gets one payment redirect and one receipt for all payable lines.
- Staff can identify orders whose capacity holds are past deadline.
- Cross-device draft carts remain intentionally deferred.

## Alternatives Considered

- Create registrations line by line: rejected because partial failures and
  concurrent capacity changes are difficult to reconcile.
- Treat provider checkout expiry as the application hold: rejected because the
  provider minimum is longer than the product's capacity promise.
- Store one undivided order ledger payment: rejected because registration
  balances and later reconciliation require stable per-line allocations.

## Revisit When

Revisit for saved carts, partial refunds, taxes, inventory-backed add-ons, or
providers that cannot explicitly make a hosted session unpayable.
