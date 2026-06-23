# Contributing

## Development Requirements

- Node.js 24
- pnpm 10 through Corepack
- Docker with Docker Compose

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up
pnpm dev
```

Run the complete local stack with:

```bash
pnpm dev:local
```

## Verification

Before requesting review, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Changes to authorization, tenant isolation, encryption, capacity allocation,
payments, auditing, or Restricted data require focused security tests.

## Commit Signoff

Contributions use the Developer Certificate of Origin. Sign commits with:

```bash
git commit -s
```

The signoff certifies the contribution under the terms in `DCO`.

## Architecture Changes

Record durable decisions in `docs/adr` using the template. Keep pull requests
focused and explain security, data, and migration consequences.
