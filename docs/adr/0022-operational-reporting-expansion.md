# ADR 0022: Operational Reporting Expansion

- Status: Accepted
- Date: 2026-07-22
- Decision owners: Project owner
- Related: ADR 0002, ADR 0003, ADR 0004, ADR 0005, ADR 0016, ADR 0021

## Context

The first reporting slice provides audited single-session roster and check-in CSV
downloads. Camp operators also need repeatable views across sessions, native Excel
files, print layouts, readiness and balance queues, and saved filters without
copying operational data into external spreadsheets before every work cycle.

Reporting must preserve tenant scope and authorization, avoid turning a preset
library into an unrestricted query builder, and keep restricted health details
behind the health-domain boundary that has not yet shipped.

## Decision

- Provide nine fixed operational presets: cross-session roster, check-in sheet,
  contact list, balances due, waitlist, form readiness, attendance activity,
  pickup sheet, and camper labels.
- Filter by one or more sessions, session start-date range, and registration
  status. Resolve every filter against tenant-owned database rows; the browser
  never supplies report rows or authoritative counts.
- Store named tenant-owned report views with optimistic versions. Staff may edit
  their own views, and camp or organization administrators may manage any view.
- Export UTF-8 CSV or a native Office Open XML workbook. CSV values that begin
  with spreadsheet formula characters are neutralized; XLSX cells are emitted as
  values, not formulas.
- Render print previews in the authenticated application with dedicated roster,
  pickup, and label print CSS. Do not create public or cacheable report URLs.
- Record aggregate export metadata and saved-view mutations in the audit trail.
  Audit details include the preset, format, filters, and row count, but not camper,
  family, contact, form-response, or attendance content.
- Project only operational readiness data: form counts/status and whether a
  support note exists. Do not include support-note text, clinical details, form
  responses, or future restricted health records.
- Retain the first-slice single-session CSV endpoint for compatibility while the
  expanded reporting endpoint becomes the primary reports workspace path.

## Consequences

- Staff can reuse common reporting workflows across sessions and choose CSV,
  XLSX, or print without exporting addresses merely to build a recipient list.
- Presets remain understandable and testable, but arbitrary joins, calculated
  columns, dashboards, and a custom report builder remain deferred.
- The current support-note indicator is intentionally coarse. Restricted health
  projections require separate roles, access auditing, and data classification.
- Export data is generated synchronously. Large asynchronous report jobs can be
  added later if observed tenant volumes exceed the synchronous operating limit.

## Alternatives Considered

- Add a free-form SQL or drag-and-drop report builder: rejected because it would
  create substantial authorization, query-cost, privacy, and support risk before
  preset demand is understood.
- Export HTML files from the API for printing: rejected because the authenticated
  browser can provide an accessible preview and print stylesheet without another
  sensitive downloadable artifact.
- Include current readiness and accessibility note text: rejected because this
  reporting slice must not weaken the forthcoming restricted-health boundary.

## Revisit When

Revisit for custom columns and calculations, asynchronous exports, trend and
year-over-year analytics, accounting mappings, clinical projections, scheduled
report delivery, or validated nonprofit/compliance report requirements.
