# Camp Registration

An open-source platform for camp registration and camp operations.

## Status

The project has a local-first MVP foundation with implemented catalog, family,
camper, admin registration, household multi-camper orders, parent and staff
order history, cancellation, and atomic individual or grouped waitlist
workflows. Household checkout supports add-ons, automatic discounts, coupons,
approved financial assistance, and parent-selected installment plans through
provider-hosted payments. Staff can configure pricing, review assistance,
inspect stuck holds, and reconcile immutable per-registration ledger
allocations. Reusable forms and waivers, version-bound drafts,
acknowledgements, electronic signatures, attendance check-in, scheduled queue
advancement, and transactional email delivery are also implemented.
Authentication remains local-development oriented; the domain layer enforces
linked-adult family ownership and tenant isolation for parent actions.

## Planned Scope

- Family and camper profiles
- Camp programs and sessions
- Versioned registration forms and electronic waivers
- Operational exports and downstream reporting
- Parent portal enhancements and administrative dashboard
- Rosters, health records, attendance, and communications

## Local Development

Requirements:

- Docker Desktop with Docker Compose
- Node.js 24 and pnpm 10 for host-based development

Start the complete local stack:

```bash
docker compose up --build
```

The local services are:

- Web application: <http://localhost:3000>
- API and OpenAPI UI: <http://localhost:3001/docs>
- Mailpit email inbox: <http://localhost:8025>
- Waitlist worker: background service for expiration, advancement, reminders,
  outbox delivery, automatic tenant discovery, and persistent health reporting
- Billing worker: background service that expires hosted checkout sessions
  before releasing capacity holds, updates installment states, and queues
  installment reminders
- MinIO console: <http://localhost:9001>
- PostgreSQL: `localhost:5432`

Local development enables a payment-provider test adapter. It exercises the
same attempt, redirect, reconciliation, ledger, and receipt path without asking
for card details. Production sets `PAYMENT_PROVIDER=stripe`, platform Stripe
secrets, and each camp's connected account ID; Checkout remains Stripe-hosted.

For faster host-based application development, start the supporting services
with `pnpm infra:up`, run `pnpm db:migrate` and
`pnpm db:seed:winter-families`, then run `pnpm dev`. The root `.env` must
provide the runtime and migration database URLs shown in `.env.example`.

## Quality Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The optional k6 harness requires a local k6 installation and runs with
`pnpm test:load`. It currently exercises API health only; registration spike
coverage will be added with the registration workflow.

## Architecture

- [Data flow and process flows](docs/data-flow-and-process-flows.md)
- [Architecture decision index](docs/adr/README.md)
- [Waitlist automation and outbox decision](docs/adr/0012-waitlist-automation-outbox.md)
- [Waitlist worker discovery and health decision](docs/adr/0013-waitlist-worker-tenant-discovery-and-health.md)
- [Waitlist notification issue and replay decision](docs/adr/0014-waitlist-notification-issue-replay.md)
- [Organization waitlist offer duration decision](docs/adr/0015-organization-waitlist-offer-duration-policy.md)
- [Versioned forms and consent decision](docs/adr/0016-versioned-forms-and-consent.md)
- [Provider-backed deposit reconciliation decision](docs/adr/0017-provider-backed-deposit-reconciliation.md)
- [Household orders and capacity holds decision](docs/adr/0018-household-order-capacity-holds.md)
- [Pricing, assistance, and installment decision](docs/adr/0019-pricing-assistance-and-installments.md)
- [Foundation stack decision](docs/adr/0001-foundation-stack.md)
- [Terraform deployment boundary](infra/terraform/README.md)
- [Contributor guidance](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Project Management

Public feature requests, bugs, and contributor tasks will be tracked with GitHub
Issues. Product research and internal planning are maintained separately from
this public repository.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions use the Developer
Certificate of Origin sign-off recorded in [DCO](DCO).

## License

The project is licensed under the Apache License 2.0 (`Apache-2.0`). See
`LICENSE`.

The software license does not grant rights to project names, logos, or other
branding. A separate trademark policy will be added after a distinctive project
brand is selected.
