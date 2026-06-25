# Database Fixtures

`2027-mvp-catalog.json` is fictional public test data derived from the approved
MVP camp-session sample. Stable identifiers allow tests to reference records
without relying on array position.

`2027-winter-families.json` is fictional family load-test data for local
workflow and registration-capacity testing. It contains 140 families, 250
adults, 157 emergency or pickup contacts, and 273 campers. Exactly 200 campers
are in grades 9 through 12 so the fixture can fill a 200-seat high-school winter
camp session, while younger siblings support day, elementary, and junior-high
camp testing. The winter family seed also registers 140 eligible campers into
High School Camp 1 with 84 female and 56 male campers, matching a 60/40 split
for that session's current capacity.

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
- Family fixture emails use the reserved `example.test` domain.
- Family fixture phone numbers use fictional `+1-NPA-555-01XX` values.
- Family fixture people, families, emails, and phone numbers are synthetic.

This fixture supports catalog and workflow development. Tenant-isolation tests
must add at least one additional organization and must not rely on this
single-organization fixture alone.

Seed the catalog plus winter family load fixture into a local database with:

```bash
MIGRATION_DATABASE_URL=postgresql://camp:camp@127.0.0.1:5432/camp_registration pnpm db:seed:winter-families
```
