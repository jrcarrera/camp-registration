# API Engineering Guide

- Route handlers validate transport input and call domain services; they do not
  contain domain or persistence logic.
- Define request and response schemas for every endpoint and publish them through
  OpenAPI.
- Perform authentication in middleware and authoritative object-level
  authorization in the service layer.
- Require explicit organization context for tenant operations.
- Use database transactions for capacity, registration, payment state, and audit
  changes that must commit together.
- Use PostgreSQL row locks in a stable order for capacity allocation.
- Use database-generated UTC timestamps and a database sequence when total order
  matters.
- Return stable problem responses without internal errors or sensitive data.
- Add injection tests for routes and integration tests for database boundaries.
