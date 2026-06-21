# ADR 0001: Foundation Stack

- Status: Accepted
- Date: 2026-06-21
- Decision owners: Project owner

## Context

The MVP must be API-driven, locally testable without AWS, deployable to AWS ECS
Fargate, maintainable by a small team, and capable of strong tenant isolation and
deterministic registration.

## Decision

- Use a `pnpm` TypeScript monorepo without an additional task orchestrator.
- Use Next.js for the responsive browser application.
- Use Fastify with TypeBox schemas for the REST API and OpenAPI document.
- Use PostgreSQL with Drizzle for typed schema access and explicit SQL for RLS,
  locking, and security-sensitive migrations.
- Use Vitest, Testcontainers, Playwright, and k6 for local verification.
- Use Docker Compose with PostgreSQL, MinIO, and Mailpit for local services.
- Keep identity, payment, storage, email, encryption, and AWS dependencies behind
  provider interfaces.
- Use a PostgreSQL-backed durable job queue; choose the maintained library when
  background processing is implemented.

## Consequences

- The web client and API can evolve atomically with shared contracts.
- Local development requires Node, pnpm, and Docker but no AWS account.
- Security-sensitive SQL remains visible and testable instead of hidden behind
  ORM behavior.
- The project accepts a single deployment and database as the MVP operational
  boundary.

## Alternatives Considered

- NestJS: more framework structure than the initial team needs.
- GraphQL: no concrete query requirement justifies its authorization complexity.
- Lambda or EKS: weaker local parity or unnecessary operations overhead.
- Prisma: less direct control for the accepted RLS and locking design.
- Redis-backed jobs: an additional service without a demonstrated requirement.

## Revisit When

- Independent team ownership requires separate deployment boundaries.
- PostgreSQL job throughput or isolation is demonstrably insufficient.
- API client needs cannot be represented cleanly through REST and OpenAPI.
