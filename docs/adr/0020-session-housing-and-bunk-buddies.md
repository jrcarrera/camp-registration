# ADR 0020: Session Housing Inventory and Placement

- Status: Accepted
- Date: 2026-07-19
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0008

## Context

Camps need to turn confirmed enrollment into a safe, understandable pre-session
housing plan. Physical buildings and beds are reusable, while availability and
camper placement change by session. Staff also need to reduce operating cost by
closing unused buildings and should honor friend requests where capacity allows.

## Decision

Model buildings and beds as organization-owned inventory. Dedicate a building to
a session through a separate open/closed record. Store exactly one assignment
per confirmed registration and one assignment per bed within a session. Reject
use of the same physical bed in sessions whose date ranges overlap.

Parents may submit up to three free-text bunk-buddy names with each cart line.
The preference is snapshotted on both the order line and resulting registration.
It is a request, not a guarantee. Housing placement normalizes exact camper names
within the session and keeps recognized buddy groups in one building when that
building has enough available beds.

Housing v1 groups campers by age. Automatic placement has two explicit,
deterministic strategies:

- `BALANCED` chooses the open building with the lowest occupied-to-active-bed
  ratio, with stable identifiers breaking ties.
- `CONSOLIDATE` fills the fewest suitable open buildings and then marks unused
  open buildings closed.

Existing manual assignments are retained. Automatic placement only processes
unassigned confirmed campers. Admins perform inventory, configuration, and
assignment writes; camp staff may view housing plans. Every write is audited.

## Consequences

- Physical inventory is reusable without copying cabins for each session.
- Session closures do not deactivate a building globally.
- A consolidated run can deliberately leave whole buildings closed.
- Unmatched or non-confirmed buddy requests remain visible as warnings.
- Bed placement is authoritative and tenant isolated, while the cart remains a
  low-risk preference capture surface.

## Alternatives Considered

- Put a building name directly on the registration: rejected because it cannot
  model bed capacity, reuse, or overlapping-session conflicts.
- Make buddy requests registration-to-registration foreign keys: deferred
  because families often know a friend's name before that friend registers and
  must not be allowed to browse other households.
- Add gender, accessibility, staff-bed, room, and activity-group policy now:
  deferred until housing v1 produces operating evidence.

## Revisit When

Revisit for room/floor hierarchy, gender or identity placement policy,
accessibility and medical restrictions, staff beds, sibling links, drag-and-drop
movement history, printable housing reports, or cross-session turnover windows.
