---
applyTo: "{app/api/**/*.ts,lib/http/validation.ts,openapi/**/*.yaml,docs/security-privacy/api-security.md,schemathesis.toml,.github/workflows/security-api.yml,scripts/security/**/*.mjs}"
---

# API Contract And Schemathesis

## Scope Decision

- When adding, removing, renaming, or changing an app-owned REST API route,
  decide whether the route belongs in the Schemathesis contract before
  finishing.
- Add browser-backed JSON REST routes to `openapi/requirements-api.yaml` when
  they are safe for the disposable prodlike SQL Server database and their
  auth/CSRF behavior is understood.
- If a route is intentionally outside Schemathesis scope, update
  `docs/security-privacy/api-security.md` scope or deferred-work notes when the documented scope
  would otherwise become stale.
- Keep `/api/mcp` governed by MCP schema/tool-contract tests, not the REST
  OpenAPI contract.

## Contract Sync

- Keep path params, query params, request bodies, headers, response status
  codes, content types, and broad response schemas aligned between route code
  and `openapi/requirements-api.yaml`.
- For mutating covered routes, document the required authenticated-session
  cookie, `Origin`, and `X-Requested-With` behavior.
- Document expected `400`, `401`, `403`, `404`, and conflict responses when
  they are reachable for the route.
- Keep payloads bounded for Schemathesis. Avoid unbounded strings, arrays, or
  destructive generated examples.
- Do not add production URLs, production secrets, vendor tokens, or external
  scan targets.

## Tests And Verification

- Add or update focused route tests for validation, auth/CSRF behavior,
  success paths, and failure paths changed by the API edit.
- Run the most direct route tests for the changed API surface.
- Run `npm run check` before declaring done when API code or the contract
  changes.
- For changes to `openapi/requirements-api.yaml`, `schemathesis.toml`,
  `docs/security-privacy/api-security.md`, or `.github/workflows/security-api.yml`, run the
  local Schemathesis flow from `docs/security-privacy/api-security.md` when the prodlike SQL
  Server and Keycloak stack is available.
- If the local Schemathesis flow is not run, state that the `Security API`
  workflow is the verification gate.
