# MCP Security Test Plan

## Purpose

The MCP security test layer hardens the MCP server without changing the public
tool surface. The tests verify that `/api/mcp` stays authenticated, exposes
only the documented tools, validates tool input with Zod, delegates
authorization-sensitive work to the requirements service, and does not leak
sensitive error details.

This is the fast repo-owned unit and transport test layer. It supports the
seeded HTTP gate in [mcp-seeded-dast.md](./mcp-seeded-dast.md) and any later
DAST expansion that scans `/api/mcp`.

## Automated Coverage

Run the focused MCP security suite with:

```sh
npm exec -- vitest run \
  tests/unit/mcp-http.test.ts \
  tests/unit/mcp-token.test.ts \
  tests/unit/mcp-security.test.ts \
  tests/unit/mcp-authz.test.ts \
  tests/unit/mcp-property.test.ts
```

The suite covers:

- Tool allowlist: exactly the documented 12 tools are exposed, and unknown
  tool names fail without invoking the requirements service.
- Bearer auth: missing, invalid, wrong-issuer, wrong-audience, missing
  `employeeHsaId`, and invalid HSA-id.
- Transport payload size: oversized POST bodies return JSON-RPC `413` before
  bearer-token verification or service creation. Tests cover the exact
  `1 MiB` default, lowered and raised Admin-configured limits, the safe
  `1 MiB` fallback when settings cannot be loaded, and the absolute `5 MiB`
  cap before database or authentication work.
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
   audience. Tokens must use a real-format `employeeHsaId`, for example
   `SE5560000001-mcp1` in the local Keycloak realm.
3. Open MCP Inspector or another MCP client that supports Streamable HTTP.
4. Configure the server URL as `http://localhost:3000/api/mcp`.
5. Add the header `Authorization: Bearer <non-production-token>`.
6. Confirm that the server lists exactly 16 tools.
7. Confirm that an unauthenticated request returns `401` and
   `WWW-Authenticate: Bearer`.
8. Call `requirements_query_catalog` with `catalog: "statuses"` and
   `operation: "list"`, then call `requirements_get_requirement` with safe
   read-only inputs.
9. Call one disposable mutation only against seeded/local data, then restore or
   recreate the local database with `npm run db:setup` if needed.

Do not use production tokens, production databases, or long-lived custom
secrets for this smoke check.

## Non-Goals

- New MCP tools or resource URIs stay out of scope.
- New database schema, seed, migration, UI, REST route, and GitHub workflow
  work stays outside the MCP transport test suite. The Admin-controlled MCP
  payload limit is covered by the AI settings DAL/API/UI tests and by focused
  MCP transport limit tests.
- Browser CSRF checks on `/api/mcp` are excluded; it remains Bearer-token
  scoped.
- Full RBAC policy coverage is handled by the shared service and focused RBAC
  tests. These transport tests prove MCP passes the verified actor context into
  that service boundary instead of trusting caller-supplied headers.
- Additional external or active DAST remains out of scope. The seeded HTTP gate
  covers repo-owned authenticated MCP transport checks; role-matrix scanning,
  ZAP API scanning, active scanning, production targets, and production secrets
  remain separate work.
