# Camp Registration

An open-source platform for camp registration and camp operations.

## Status

The project has a local-first MVP foundation with implemented catalog, family,
camper, admin registration, parent portal dashboard, parent checkout,
cancellation, and time-boxed waitlist offer workflows with parent self-service
acceptance or decline, scheduled queue advancement, and transactional email
delivery. Authentication is still
local-development oriented; the domain layer already enforces linked-adult
family ownership for parent actions.

## Planned Scope

- Family and camper profiles
- Camp programs and sessions
- Registration forms and electronic waivers
- Payments, discounts, and waitlists
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
- MinIO console: <http://localhost:9001>
- PostgreSQL: `localhost:5432`

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
