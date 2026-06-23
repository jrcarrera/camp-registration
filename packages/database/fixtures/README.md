# Database Fixtures

`2027-mvp-catalog.json` is fictional public test data derived from the approved
MVP camp-session sample. Stable identifiers allow tests to reference records
without relying on array position.

Fixture assumptions:

- The sample organization uses the `America/Chicago` time zone.
- Registration opens at 9:00 AM Central Standard Time on January 15, 2027.
- Registration closes at midnight Central Daylight Time three days before each
  session starts.
- Age eligibility is evaluated on the session start date.
- The supplied age ranges are preserved, including age 14 being eligible for
  both Junior High and High School programs.
- Availability, registration counts, active holds, and waitlist counts are
  derived operational data and are intentionally absent.

This fixture supports catalog and workflow development. Tenant-isolation tests
must add at least one additional organization and must not rely on this
single-organization fixture alone.
