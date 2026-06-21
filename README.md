# Camp Registration

An open-source platform for camp registration and camp operations.

## Status

The project has an initial local-first application foundation. Product workflows
are not implemented yet.

## Planned Scope

- Family and camper profiles
- Camp programs and sessions
- Registration forms and electronic waivers
- Payments, discounts, and waitlists
- Parent portal and administrative dashboard
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
- MinIO console: <http://localhost:9001>
- PostgreSQL: `localhost:5432`

For faster host-based application development, start the supporting services
with `pnpm infra:up`, then run `pnpm dev`.

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
