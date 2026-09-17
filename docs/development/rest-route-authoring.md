# REST Route Authoring

Use this checklist when adding, removing, renaming, or changing an app-owned
REST operation under `app/api`.

## Register the operation

Add one explicit declaration to
`lib/http/route-security-policy.ts` for every exported `GET`, `POST`, `PUT`,
`PATCH`, or `DELETE` handler. Use the uppercase method and the canonical
Next.js template, for example `PUT /api/requirements/[id]`.
Remove or rename the matching declaration when removing or renaming a handler.
`HEAD` derives from `GET`; `OPTIONS` derives from the path policy. Neither
needs a separate registry declaration.

Declare all five policies:

- `auth`: `public` or `session`
- `csrf`: `same-origin`, `none`, or the restricted `native-csp-report` exception
- `sensitivity`: `public`, `authenticated`, or `sensitive`
- `cache`: `framework-default`, `no-cache`, or `no-store`
- `contract`: `openapi` or `focused`

There are no defaults. Session mutations use `same-origin`; logout is the only
public operation using `same-origin`. The anonymous native CSP reporting
mutation has its own exception described below. Sensitive responses use
`no-store`. Preserve existing cache behavior and do not introduce public
caching or `max-age`.

`/api/mcp` is not a REST registry entry. It keeps its Bearer-token JSON-RPC
contract and is the only direct mutation-export exception.

## Use the approved wrapper

Wrap `POST`, `PUT`, `PATCH`, and `DELETE` handlers with
`secureMutationRoute`. Use `secureLogoutMutationRoute` only for
`POST /api/auth/logout`, and `nativeCspReportRoute` only for the native CSP
reporting exception below. Export the wrapped handler instead of a direct
mutation function.

Every `secureMutationRoute` call needs an authorization `policy`:

- `adminMutationPolicy` for Admin Center and reference-data mutations.
- `requirementsMutationPolicy` for requirement, specification,
  improvement-suggestion, deviation, and AI requirement-generation mutations.
- `customMutationPolicy` for route-specific authorization, such as privacy
  self-export or assigned access-review reviewers. Do not use a no-op policy.

Use wrapper-provided `context`, `params`, `body`, and `request`. Validate route
parameters with `paramsSchema` and JSON bodies with `bodySchema`; use
`bodyReader` with `readBoundedJsonWithSchema` when a byte limit must run before
parsing. Do not re-read the session or recreate the request context. Keep
provider calls, throttling, database writes, and service mutations inside the
authorized handler.

Use `withRestResponsePolicy` for a `GET` handler whose registry cache policy is
`no-store` or `no-cache`. Framework-default reads do not need a wrapper. Do not
set route-local `Cache-Control`; shared wrappers and the proxy apply the
registered response policy.

Keep request-dependent authorization, validation, database work, business
logic, and audit detail in the existing route, policy, and service layers.

## Decide the contract scope

Use `contract: openapi` for browser-backed JSON REST operations that are safe
for the disposable prodlike SQL Server database and whose auth/CSRF behavior
is understood. Keep parameters, headers, bodies, response statuses, content
types, and schemas synchronized in `openapi/requirements-api.yaml`, including
matching `x-auth`, `x-csrf`, and `x-cache` declarations. For covered session
mutations, document the session cookie, `Origin`, and `X-Requested-With`
requirements. Use `contract: focused` when
focused tests remain the appropriate contract and keep that operation outside
OpenAPI. Update the scope or deferred-work notes in
[REST API Security Scan](../security-privacy/api-security.md) if that decision
changes the documented scope.

## Verify

Add or update focused route tests for changed authorization, validation,
success and failure responses, audit behavior, and cache headers. Run those
tests alongside the registry, proxy, wrapper, cache, auth, and OpenAPI contract
tests. Run `npm run check` and `npm run build` before completion. When the
prod-like SQL Server and Keycloak stack is available, also run the local
Schemathesis flow
from [REST API Security Scan](../security-privacy/api-security.md).
If that flow cannot run locally, state that the `Security API` workflow is the
verification gate.

## Native browser CSP exception

Use `nativeCspReportRoute` only for `POST /api/security/csp-reports` and its
exact registry declaration: `auth: public`, `csrf: native-csp-report`,
`sensitivity: public`, `cache: no-store`, and `contract: focused`. Native
reporting cannot set the custom application mutation header. Treat reports as
anonymous untrusted input even when cookies are attached, and apply bounded
anonymous admission before reading settings. The wrapper preserves the
registry response policy. Ordinary routes continue using
`secureMutationRoute`. See [ADR 0062](../adr/0062-anonym-native-csp-rapportering.md).
