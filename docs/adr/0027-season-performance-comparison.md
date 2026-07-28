# ADR 0027: Season Performance Comparison

- Status: Accepted
- Date: 2026-07-27
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0022, ADR 0025, ADR 0026

## Context

Season rollover now preserves explicit year-to-year setup lineage, and the
application has consistent registration, payment, refund, and capacity history.
Operators need to know whether enrollment and cash performance are improving
without exporting several reports and rebuilding the comparison in a
spreadsheet.

## Decision

Provide a tenant-scoped comparison of any two seasons to finance staff and
administrators. The aggregate includes active session count and capacity,
confirmed, waitlisted, and cancelled registrations, unique confirmed campers,
booked tuition, settled online and recorded offline cash, succeeded refunds,
net cash, outstanding balances, and returning campers.

Treat booked tuition, ledger credit, and cash as different measures. Cash
collected excludes discounts, scholarships, and account credits; net cash
subtracts succeeded provider refunds. Returning campers are stable camper
records with a confirmed registration in both selected seasons.

Compute the comparison from authoritative tenant-owned tables under PostgreSQL
row-level security. Do not persist a second analytics copy. Every comparison
read produces a structured `report.season_comparison_viewed` audit event, and
the API response is private and non-cacheable.

## Consequences

- Operators receive a current comparison without spreadsheet joins.
- Existing corrections and refunds appear on the next read rather than waiting
  for a snapshot refresh.
- The query is appropriate for the current data volume; large installations may
  later need asynchronously refreshed aggregates.
- Percent change has no baseline when the comparison value is zero.

## Alternatives Considered

- Compare only exported CSV files: rejected because it duplicates metric
  definitions outside the application and is easy to make inconsistent.
- Persist nightly season snapshots now: rejected because current scale does not
  justify delayed data or another reconciliation path.
- Give ordinary camp staff access to financial comparison: rejected because the
  view is strategic and financial rather than a daily roster workflow.

## Revisit When

Revisit for same-day enrollment-pace alignment, program/session drill-down,
forecasting, multi-currency support, scheduled board reports, or material query
latency at production scale.
