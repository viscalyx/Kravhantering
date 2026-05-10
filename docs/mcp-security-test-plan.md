# MCP Security Test Plan

## Purpose

Phase 3 hardens the MCP server without changing the public tool surface. The
tests verify that `/api/mcp` stays authenticated, exposes only the documented
tools, validates tool input with Zod, delegates authorization-sensitive work to
the requirements service, and does not leak sensitive error details.

This is a repo-owned unit and transport test layer. It must pass before later
authenticated DAST phases scan `/api/mcp`.

## Automated Coverage

Run the focused Phase 3 suite with:

```sh
npm exec -- vitest run \
  tests/unit/mcp-http.test.ts \
  tests/unit/mcp-token.test.ts \
  tests/unit/mcp-security.test.ts \
  tests/unit/mcp-authz.test.ts \
  tests/unit/mcp-property.test.ts
```

The suite covers:

- Tool allowlist: exactly the documented 11 tools are exposed, and unknown
  tool names fail without invoking the requirements service.
- Bearer auth: missing, invalid, wrong-issuer, wrong-audience, missing
  `employeeHsaId`, invalid HSA ID, and accepted synthetic `mcp-client:*`
  identities.
- Authorization seams: representative MCP calls receive a `RequestContext`
  with `source: "mcp"`, the expected `toolName`, the request ID, and the
  verified actor attached at the HTTP edge.
- Input validation: invalid `locale`, invalid `responseFormat`, unknown
  fields, overlong bounded strings, malformed IDs, invalid version numbers, and
  invalid status IDs.
- Mutation safety: stale edits and invalid draft deletion return readable
  domain errors, specification add/remove preserves idempotent service results,
  and generated AI requirements are not persisted until a separate create call.
- Error hygiene: unexpected tool exceptions return
  `Error: An internal error occurred` and do not include stack traces, SQL,
  bearer tokens, JWT-like strings, authorization codes, `state`, `nonce`,
  verifiers, or secret-shaped values.

## Manual MCP Smoke

Use only disposable local services and non-production credentials.

1. Start the local SQL Server and app with the normal developer workflow.
2. Obtain or mint a non-production Bearer token for the configured issuer and
   audience. The token must include `employeeHsaId`; service-account tests may
   use `mcp-client:<client-id>`.
3. Open MCP Inspector or another MCP client that supports Streamable HTTP.
4. Configure the server URL as `http://localhost:3000/api/mcp`.
5. Add the header `Authorization: Bearer <non-production-token>`.
6. Confirm that the server lists exactly 11 tools.
7. Confirm that an unauthenticated request returns `401` and
   `WWW-Authenticate: Bearer`.
8. Call `requirements_query_catalog` and `requirements_get_requirement` with
   safe read-only inputs.
9. Call one disposable mutation only against seeded/local data, then restore or
   recreate the local database with `npm run db:setup` if needed.

Do not use production tokens, production databases, or long-lived custom
secrets for this smoke check.

## Non-Goals

- No new MCP tools or resource URIs.
- No database schema, seed, migration, UI, REST route, or GitHub workflow
  changes.
- No browser CSRF checks on `/api/mcp`; it remains Bearer-token scoped.
- No RBAC policy rollout. Phase 3 proves MCP passes correct context into the
  shared service. Role policy activation remains later RBAC work.
- No external DAST. Authenticated dynamic scanning of `/api/mcp` belongs after
  this unit/transport hardening layer is green.
