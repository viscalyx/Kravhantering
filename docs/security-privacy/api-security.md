# REST API Security Scan

<!-- cSpell:ignore Schemathesis -->

The repo-owned REST API security scan uses a static REST API contract and a
bounded Schemathesis scan. The scan runs against the same local prodlike app
shape used by the DAST workflow: SQL Server, Keycloak, and Next.js on
`http://localhost:3001`.

## Scope

The static contract lives in
[openapi/requirements-api.yaml](../../openapi/requirements-api.yaml). It documents
current JSON behavior for browser-backed app REST APIs in scope. The file is
not served by the app and does not add a runtime `/openapi` route.

Covered by this contract:

- `/api/auth/me`
- Privacy erasure and data subject access export routes
  (`POST /api/privacy/erasure-preview`,
  `POST /api/privacy/erasure-requests`,
  `POST /api/privacy/data-subject-export`). Contract examples use disposable
  seeded HSA-ids, the scan session has `PrivacyOfficer`, and all three routes
  apply `Cache-Control: no-store` to every application response. Erasure
  execution accepts stale generated preview tokens as a normal `409` response
  during fuzzing.
- Requirement list, detail, create, edit, archive, version read,
  delete-draft, restore, reactivate, and transition routes.
- The requirements-specification item GET route returns only bounded pages of
  at most 100 mixed library and specification-local requirement applications.
  Its filters and ordering apply in SQL Server over the complete result, and
  malformed or query-mismatched continuation state returns `invalid_cursor`.
- The requirements-specification requirement-package catalog GET route returns
  bounded pages of at most 100 active packages represented by current published
  library requirements in that specification. Its opaque cursor is bound to the
  specification and normalized name search, while `includeIds` authoritatively
  resolves at most 200 selected package IDs against the same scoped membership.
- Requirement list continuation uses bounded opaque cursors. Cursors contain
  null rank, the SQL sort key, the stable numeric requirement id, and a hash of
  normalized query and visibility state. Free-text and lookup-name sort keys
  are bounded; the system-generated unique requirement id is already bounded
  by its domain. Cursors do not contain raw filters or the full requirement
  text. Malformed or mismatched cursors return `invalid_cursor` with status
  `400`.
- `GET /api/requirements/export` is the complete Requirements Library CSV
  contract. It accepts the documented filters, locale, and sort but no cursor
  or page size, and uses the same authorization and SQL ordering as list pages.
  Node can reject an oversized request target before application routing with
  `431`; the contract documents that runtime response without weakening status
  conformance for other responses or routes.
- `GET /api/requirements-specifications/{id}/exports` serves procurement and
  full CSV only after specification read authorization and procurement
  lifecycle validation. Both profiles use the common bounded CSV settings,
  same-request private spool, stable capacity envelopes, and sanitized
  terminal events.
- Requirement detail responses include server-derived permissions for the
  current actor and requirement; there is no separate generic permissions
  endpoint in the v1 contract.
- Requirements library catalog read routes used by the UI, including
  requirement areas, categories, types, statuses, packages, quality
  characteristics, priority levels, and norm references.
- Norm-reference archive and reactivate mutations stay in scope because they
  are bounded state changes with path-only input, standard CSRF headers, and
  stable JSON responses.

Operational probes stay outside the OpenAPI/Schemathesis contract. `/api/health`
is a public, dependency-free liveness check. `/api/ready` is a management probe
restricted to configured source networks at production and prodlike Nginx
edges; direct development-server access retains its local behavior. Readiness
returns only `ready` or `not_ready`, uses `Cache-Control: no-store`, coalesces
concurrent work, caches completed outcomes internally for five seconds, and
logs sanitized dependency failures on the server instead of exposing topology
in the HTTP response.

The delete-draft success contract intentionally reports the same deletion-ledger
payload for both outcomes: `deleted` is an ordered array with the
`draftRequirementVersion` entry first. When deleting that draft also deletes the
parent requirement row, the array includes a second `requirement` entry for the
same `requirementUniqueId`.

Deferred from this contract:

- `/api/database-schema-status` remains outside the OpenAPI/Schemathesis
  contract. It is an authenticated UI diagnostic route for the global
  navigation version tooltip. It returns the expected database schema version
  and a sanitized match state; only Admin users receive the observed TypeORM
  migration `name`, and only for mismatch diagnostics.
- CSV, PDF, and report export routes remain outside the
  OpenAPI/Schemathesis v1 contract, except for data-subject export and
  `GET /api/requirements/export`. The Admin-only
  `GET /api/admin/audit-events` Action-log JSON and CSV endpoint is also
  intentionally excluded and governed by focused authorization, traversal,
  capacity-envelope, and download tests. The excluded routes'
  useful assertions are exact columns, localized filenames, byte content,
  `Cache-Control: no-store`, and authorization-before-data checks, so focused
  route/report tests are the better coverage mechanism.
- AI routes (`/api/ai/**`) remain outside the OpenAPI/Schemathesis v1
  contract. They include streaming responses, provider-specific failure modes,
  model capability discovery, prompt construction, image payload validation,
  throttling, and vendor-token boundaries that are covered by focused route,
  schema, and provider-client tests. The requirement-generation route reads at
  most 42 MiB of JSON before parsing, returns `413` with
  `ai_request_bytes_exceeded` above that limit, and retains the separate limit
  of three unique images at 10 MiB decoded bytes each. Image data URLs are
  schema-bounded to their maximum base64 representation before decoded-size
  validation. The JSON-repair route reads at most 1 MiB before parsing and
  returns the same stable `413` code above that limit. It also normalizes and
  deduplicates validation errors before AI safety screening and provider use.
- Admin catalog and settings mutations remain outside the
  OpenAPI/Schemathesis v1 contract when their assertions depend on Admin-only
  access, CSRF/same-origin enforcement for saves, privileged audit, effective
  configuration precedence, or linked-object conflict checks.
- AI connection and run-profile administration routes under
  `/api/admin/ai-connections` and `/api/admin/ai-run-profiles` remain outside
  the OpenAPI/Schemathesis v1 contract. They are Admin-only, sensitive,
  `no-store` state-machine APIs whose useful assertions cover model
  verification followed by an explicit save, direct stable-profile saves,
  connection and provider-secret activation, encrypted write-only secrets,
  external probes, optimistic concurrency, dependency invalidation, and
  redacted privileged audit. Mutations use same-origin CSRF enforcement and
  focused route/service/SQL tests; generated disposable-database traffic must
  not trigger provider calls or lifecycle changes.
- Access-review routes remain outside the OpenAPI/Schemathesis contract for
  now. They use the same request-context and CSRF protections as other Admin
  Center mutations, but the useful assertions are role-matrix and
  audit-redaction tests: Admin can create, cancel, complete, and export runs;
  create derives the reviewer from the verified session actor instead of
  accepting a reviewer body; create is rejected with conflict while another run
  is `draft` or `in_review`; cancellation is a status change rather than hard
  deletion; the assigned reviewer can decide their own run; other users receive
  403; export responses use `Cache-Control: no-store`; and audit detail never
  contains a raw reviewed HSA-id list.
- Requirement-selection stewardship routes and specification saved-answer
  mutations remain outside the OpenAPI/Schemathesis v1 contract. They are still
  protected by `secureMutationRoute`, CSRF/origin checks, route/body validation,
  and focused unit/UI tests, but their useful assertions are state-machine,
  duplicate, cleanup, and filter-calculation behavior rather than broad fuzzing
  in this first contract slice.
- Requirement import preview/execute routes and the authenticated import schema
  and import-instruction routes remain outside the OpenAPI/Schemathesis v1
  contract.
  They accept large user-authored JSON documents, use workflow-specific
  stateless preview tokens, and are covered by strict schema/unit tests,
  secure-route coverage, authorization policies, and manual workflow cases
  rather than generated fuzzing in this contract slice.
- Requirements specification CRUD, item mutation/detail,
  available-requirements, responsible, local-requirement, and needs-reference
  routes remain outside the OpenAPI/Schemathesis v1 contract. The bounded item
  collection GET route is the exception documented above. The excluded routes'
  useful assertions are assignment authorization, co-author/responsible role
  behavior, local-versus-library item semantics, import preview tokens,
  duplicate handling, and UI workflow state.
- Co-author assignment management routes for requirement areas, requirements
  specifications, and requirement packages remain outside the
  OpenAPI/Schemathesis v1 contract. They are same-origin editing helpers backed
  by `secureMutationRoute`, HSA-id verification, scoped assignment permissions,
  conflict checks against owner/lead roles, and focused route/UI tests.
- Requirements specification report-output, traceability-items, bounded
  selected-item resolution, and CSV export routes remain outside the
  OpenAPI/Schemathesis v1 contract with the other specification and CSV
  surfaces. Their useful assertions are
  authorization-before-data, lifecycle profile gating, linked-version
  selection, normalized bounded traversal, exact output columns, no partial
  success, and privacy-safe capacity telemetry.
- Direct callers can submit at most 200 stable item references to the
  specification selected-item resolution endpoint and to selected-item
  needs-reference or removal mutations. Requests with more than 200 references
  fail request validation before resolution or mutation work. This limit
  bounds one shared action; it does not limit specification size, pagination,
  display, or explicit selection.
- Specification deviation routes, requirement-library deviation routes, and
  improvement-suggestion routes remain outside the OpenAPI/Schemathesis v1
  contract. Their useful assertions are lifecycle state machines, reviewer
  decisions, revert-to-draft behavior, parent authorization before child
  payload reads, published and unpublished requirement policy, 403/404
  separation, `Cache-Control: no-store`, audit detail, and UI stepper behavior.
- Norm-reference create, update, and delete routes remain outside the
  OpenAPI/Schemathesis v1 contract. `GET /api/norm-references`,
  `POST /api/norm-reference-actions/{id}/archive`, and
  `POST /api/norm-references/{id}/reactivate` stay in scope; the remaining
  stewardship mutations are covered by secure-route and focused route/UI tests.
- Admin Center settings routes such as `GET/PUT/PATCH /api/admin/ai-settings`,
  `POST/PATCH /api/admin/ai-forensic-captures`,
  `GET/PATCH /api/admin/application-settings`,
  `GET/POST /api/admin/ai-safety-rules`, AI safety term mutation routes, and
  `GET/PUT /api/admin/hsa-id-prefixes` remain outside the
  OpenAPI/Schemathesis v1 contract. Their useful assertions are Admin-only
  access, CSRF/same-origin enforcement for saves, privileged audit, effective
  configuration precedence, two-person forensic-capture authorization,
  fail-closed AI safety behavior, and focused UI behavior.
- HSA person verification remains outside the OpenAPI/Schemathesis v1
  contract. `POST /api/requirement-responsibility-people/verify` is a
  same-origin, CSRF-protected editing helper that is only useful with an
  authenticated session, assignment purpose, and, where applicable, scoped edit
  permission. Caller and target fingerprints drive rate limits, sanitized
  outcomes are audited, and successful lookups return short-lived evidence
  bound to caller, target, purpose, scope, and expiry. Verification does not
  persist the person; the final assignment route validates evidence and stores
  person plus assignment atomically. The app does not expose a browser-usable
  general HSA search route.
- MCP remains outside the REST OpenAPI/Schemathesis contract. `/api/mcp` is
  governed by MCP schemas, tool-contract tests, Bearer-token authentication
  tests, the Admin-configured MCP payload-size guard that defaults to `1 MiB`
  with an absolute `5 MiB` cap, and the seeded MCP workflow rather than REST
  route fuzzing.
- Paid vendor scanners that require service-specific CI secrets.

The existing catalog `GET /api/requirement-packages` route stays in scope and
documents its `includeArchived=true|false` query parameter because it is a
read-only browser catalog endpoint used by the stewardship UI.
The catalog `GET /api/norm-references` route also stays in scope and documents
`includeArchived`, `includeIds`, `linked`, and `statuses` query parameters.

ZAP API scanning now uses a filtered read-only contract derived from this
static source. Issue #119 tracks the broader DAST workflow split where useful
coverage belongs in ZAP API, role-matrix, or full active ZAP workflows instead
of this Schemathesis contract. Those workflows exercise browser crawl and
active DAST behavior rather than route-level schema conformance.

## Runtime Validation

Application-owned REST routes validate caller-controlled path params, query
params, and JSON bodies with shared Zod schemas in
`lib/http/validation.ts`. Invalid route input returns a typed `400` response
before database or service work whenever the route can validate independently:

```json
{
  "error": "Invalid request",
  "issues": [{ "path": "id", "code": "invalid_format", "message": "..." }]
}
```

JSON objects are strict: unknown body fields and unknown app-owned query params
are rejected instead of being ignored. Integer IDs must be positive SQL Server
integers, booleans must use the documented representation for their transport,
strings are bounded, arrays are capped, and malformed JSON receives the same
typed validation envelope.

Every explicit app-owned REST operation under `app/api` is declared in
`lib/http/route-security-policy.ts`. The 205-operation registry records auth,
CSRF, sensitivity, cache, and contract scope without defaults. It uses
uppercase methods and canonical Next.js templates, derives `HEAD` from `GET`,
and derives `OPTIONS` from the matched path without CSRF. Literal segments take
precedence over dynamic segments. Queries and fragments do not participate in
matching, trailing slashes are normalized, path case is preserved, and encoded
slashes are not decoded.

The proxy and approved route wrappers resolve policy from each request.
Unknown REST operations receive the conservative session-authenticated,
mutation-CSRF, sensitive, `no-store` baseline and then pass to Next.js, so an
ordinary nonexistent URL still returns `404`. Proxy-generated authentication,
CSRF, unsupported-method, and canonical-redirect responses receive the same
cache policy as handler responses. Unsupported methods use the most restrictive
response policy registered for their path.

All app-owned mutating REST route exports (`POST`, `PUT`, `PATCH`, and
`DELETE`) go through `lib/http/secure-mutation-route.ts`. The standard order is
request context and same-origin/CSRF validation, authenticated actor check,
route param and JSON body validation, declared authorization policy, then
handler work. Every mutating REST route declares an `admin`, `requirements`, or
`custom` policy; logout uses the explicit `secureLogoutMutationRoute` special
case because it is public with CSRF and audit but no business authorization
policy. Restrictive reads use `withRestResponsePolicy`; route modules do not
repeat `Cache-Control` declarations. Coverage tests inspect actual route
exports and observable wrapper branding.

The OpenAPI file keeps its bounded 29-operation scope. Each included operation
declares `x-auth`, `x-csrf`, and `x-cache`; tests require exact agreement with
`contract: openapi` registry entries and keep `contract: focused` operations
outside OpenAPI. See
[REST Route Authoring](../development/rest-route-authoring.md) for the change
checklist.

Authorization denials from these policies are fail-closed into the database
action log before the denial response is returned. If required denial evidence
cannot be persisted, handler work remains blocked and the route returns a
generic internal `500` response without authorization or persistence details.
The action-log read endpoint, `GET /api/admin/audit-events`, is Admin-only,
read-only, `no-store`, supports a validated `client_ip` filter alongside the
other audit filters, and intentionally does not create another action-log row.

`/api/mcp` is the intentional exception. It keeps validation inside its
JSON-RPC/MCP schema layer and uses Bearer-token authentication, so MCP tool
contracts remain the source of truth. Shared RequirementsService authorization
uses the same required denial-evidence contract and returns only a generic MCP
tool error when persistence fails.

## Workflow

Workflow file:
[.github/workflows/security-api.yml](../../.github/workflows/security-api.yml).

The workflow runs on pull requests to `main`, pushes to `main`, weekly
schedule, and manual dispatch. It uses `pull_request`, never
`pull_request_target`, and has only `contents: read` permission.

The workflow:

1. Installs the exact npm version declared by root `package.json`, then
   installs Node dependencies with `npm ci`.
2. Installs pinned `schemathesis==4.15.2` with Python.
3. Starts SQL Server with `.env.sqlserver.ci` and runs `npm run db:setup`.
4. Starts the local Keycloak realm.
5. Builds and starts the prodlike app on `127.0.0.1:3001`.
6. Polls `/api/health`.
7. Acquires the local admin session cookie for `ada.admin`.
8. Refuses to scan unless the target is exactly `http://localhost:3001`.
9. Runs Schemathesis with deterministic, bounded settings and a local-only
   request rate that fits inside the CI timeout budget.
10. Prints the Schemathesis runtime in an `always()` step so scan-speed
    regressions are visible even when the scanner fails.
11. Uploads JUnit, NDJSON, stdout/stderr, timing files, and app logs even on
    failure.

The mutating scan requests include:

- `Cookie: kravhantering_session=...`
- `Origin: http://localhost:3001`
- `X-Requested-With: XMLHttpRequest`

The cookie is masked in workflow logs. Schemathesis output sanitization remains
enabled and HAR export is intentionally not used by this workflow.

The repository `schemathesis.toml` disables coverage probes for unexpected HTTP
methods. Next.js constructs a web `Request` before application middleware runs,
and forbidden Fetch methods such as `TRACE` fail inside the framework before the
app can return a controlled `405`. The scan still covers documented operations,
parameter/body variants, server errors, status codes, content types, and
response schemas.

## Failure Policy

Schemathesis fails the workflow on:

- Server errors discovered by generated API requests.
- Status codes not documented in the OpenAPI contract.
- Content types not matching the contract.
- Response bodies not matching the broad response schemas.
- Scanner execution or schema configuration errors.

The workflow uploads artifacts before failing. A missing or broken app startup
is treated as an execution failure, not a scanner finding.

## Local Run

Run the same shape locally:

```bash
cp .env.sqlserver.ci .env.sqlserver
npm run db:up
npm run db:setup
npm run idp:up
npm run build:local-prod
```

`npm run idp:up` waits for the local Keycloak realm's OIDC discovery and
JWKS endpoints before returning.

Start the app in another shell:

```bash
npm run start:prodlike-pruned
```

This starts the previously built standalone server on `127.0.0.1:3001` and
stages its public and generated static assets.

Then install and run Schemathesis:

<!-- markdownlint-disable MD013 -->

```bash
python -m pip install "schemathesis==4.15.2"
COOKIE="$(node scripts/security/get-session-cookie.mjs ada.admin)"
schemathesis run openapi/requirements-api.yaml \
  --url http://localhost:3001 \
  --header "Cookie: ${COOKIE}" \
  --header "Origin: http://localhost:3001" \
  --header "X-Requested-With: XMLHttpRequest" \
  --phases examples,coverage,fuzzing \
  --mode all \
  --max-examples 10 \
  --seed 20260509 \
  --generation-deterministic \
  --request-timeout 5 \
  --request-retries 0 \
  --rate-limit 120/m \
  --max-failures 10 \
  --checks not_a_server_error,status_code_conformance,content_type_conformance,response_schema_conformance \
  --report junit,ndjson \
  --report-junit-path test-results/schemathesis/junit.xml \
  --report-ndjson-path test-results/schemathesis/events.ndjson \
  --output-sanitize true \
  --no-color
```

<!-- markdownlint-enable MD013 -->

Tear down after the run:

```bash
npm run idp:down
npm run db:down
```

## Adding Paths

Add new API paths only when they are safe for a disposable prodlike database and
their auth/CSRF behavior is understood.

- Prefer read routes first.
- For mutations, include only bounded payloads and document expected `400`,
  `401`, `403`, `404`, and `409` responses.
- Keep response schemas broad until a route has stable typed response
  contracts.
- Do not add production URLs, production secrets, vendor tokens, or external
  scan targets.
- For privacy paths, include only disposable seeded identities and assert that
  generated examples never log or expose raw target HSA-id values in audit
  details. Data-subject export examples should keep covering both self-export
  and `PrivacyOfficer` cross-user export.
