# REST Route Authoring

Use this checklist when adding, removing, renaming, or changing an app-owned
REST operation under `app/api`.

## Register the operation

Add one explicit declaration to
`lib/http/route-security-policy.ts` for every exported `GET`, `POST`, `PUT`,
`PATCH`, or `DELETE` handler. Use the uppercase method and the canonical
Next.js template, for example `PUT /api/requirements/[id]`.

Declare all five policies:

- `auth`: `public` or `session`
- `csrf`: `same-origin` or `none`
- `sensitivity`: `public`, `authenticated`, or `sensitive`
- `cache`: `framework-default`, `no-cache`, or `no-store`
- `contract`: `openapi` or `focused`

There are no defaults. Session mutations use `same-origin`; logout is the only
public mutation exception and still uses `same-origin`. Sensitive responses
use `no-store`. Preserve existing cache behavior and do not introduce public
caching or `max-age`.

`/api/mcp` is not a REST registry entry. It keeps its Bearer-token JSON-RPC
contract and is the only direct mutation-export exception.

## Use the approved wrapper

Wrap `POST`, `PUT`, `PATCH`, and `DELETE` handlers with
`secureMutationRoute`. Use `secureLogoutMutationRoute` only for
`POST /api/auth/logout`.

Use `withRestResponsePolicy` for a `GET` handler whose registry cache policy is
`no-store` or `no-cache`. Framework-default reads do not need a wrapper. Do not
set route-local `Cache-Control`; shared wrappers and the proxy apply the
registered response policy.

Keep request-dependent authorization, validation, database work, business
logic, and audit detail in the existing route, policy, and service layers.

## Decide the contract scope

Use `contract: openapi` only when the operation belongs to the existing
Schemathesis scope. Add matching `x-auth`, `x-csrf`, and `x-cache` declarations
to `openapi/requirements-api.yaml`. Use `contract: focused` when focused tests
remain the appropriate contract and keep that operation outside OpenAPI.

## Verify

Run the registry, proxy, wrapper, cache, auth, and OpenAPI contract tests. Run
`npm run check` and `npm run build` before completion. When the prod-like SQL
Server and Keycloak stack is available, also run the local Schemathesis flow
from [REST API Security Scan](../security-privacy/api-security.md).

The local resolver benchmark evidence for Node.js 24.18.1 on 2026-07-29 is
4.621 seconds for one million mixed literal, dynamic, sensitive, and unknown
lookups, or about 216,000 lookups per second. CI verifies the deterministic
method-and-segment indexes and does not use a timing threshold.
