# REST API Security Scan

<!-- cSpell:ignore Schemathesis -->

The repo-owned REST API security scan uses a static REST API contract and a
bounded Schemathesis scan. The scan runs against the same local prodlike app
shape used by the DAST workflow: SQL Server, Keycloak, and Next.js on
`http://localhost:3001`.

## Scope

The static contract lives in
[openapi/requirements-api.yaml](../openapi/requirements-api.yaml). It documents
current JSON behavior for the browser-backed requirements REST API. The file is
not served by the app and does not add a runtime `/openapi` route.

Covered by this contract:

- `/api/auth/me`
- Requirement list, detail, create, edit, archive, version read,
  delete-draft, restore, reactivate, and transition routes.
- Read-only requirements library routes used by the requirements UI.

Operational probes stay outside the OpenAPI/Schemathesis contract. `/api/health`
is a liveness check, and `/api/ready` is a public readiness check for
container orchestration. `/api/ready` returns only `ready` or `not_ready`,
uses `Cache-Control: no-store`, and logs sanitized dependency failures on the
server instead of exposing topology in the HTTP response.

The delete-draft success contract intentionally reports the same deletion-ledger
payload for both outcomes: `deleted` is an ordered array with the
`draftRequirementVersion` entry first. When deleting that draft also deletes the
parent requirement row, the array includes a second `requirement` entry for the
same `requirementUniqueId`.

Deferred from this contract:

- CSV export, MCP, AI routes, admin catalog mutations, specifications,
  deviations, improvement suggestions, and Admin Center access-review routes
  (`/api/admin/access-reviews/**`).
- Privacy erasure and data subject access export routes
  (`POST /api/privacy/erasure-preview`,
  `POST /api/privacy/erasure-requests`,
  `POST /api/privacy/data-subject-export`). They require the separate
  `PrivacyOfficer` role, strict CSRF/origin handling, HSA-ID-only matching,
  stale-preview rejection, and audit-redaction checks before they should be
  added to the OpenAPI fuzzing contract. The access export route also supports
  self-service export for the signed-in user's own HSA-ID, returns
  `Cache-Control: no-store`, and records only a non-reversible target
  fingerprint in audit details.
- Access-review routes remain outside the OpenAPI/Schemathesis contract for
  now, aligned with the deferred privacy-route policy. They use the same
  request-context and CSRF protections as other Admin Center mutations, but the
  useful assertions are role-matrix and audit-redaction tests: Admin can create,
  cancel, complete, and export runs; create derives the reviewer from the
  verified session actor instead of accepting a reviewer body; create is
  rejected with conflict while another run is `draft` or `in_review`;
  cancellation is a status change rather than hard deletion; the assigned
  reviewer can decide their own run; other users receive 403; export responses
  use `Cache-Control: no-store`; and audit detail never contains a raw reviewed
  HSA-ID list.
- Requirement-selection stewardship routes and specification saved-answer
  mutations remain outside the OpenAPI/Schemathesis v1 contract. They are still
  protected by `secureMutationRoute`, CSRF/origin checks, route/body validation,
  and focused unit/UI tests, but their useful assertions are state-machine,
  duplicate, cleanup, and filter-calculation behavior rather than broad fuzzing
  in this first contract slice.
- ZAP API scan, role-matrix DAST, full active scans, and paid vendor scanners
  that require service-specific CI secrets.

The existing catalog `GET /api/requirement-packages` route stays in scope and
documents its `includeArchived=true|false` query parameter because it is a
read-only browser catalog endpoint used by the stewardship UI.

Those deferred items are later issue `#119` work.

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

All app-owned mutating REST route exports (`POST`, `PUT`, `PATCH`, and
`DELETE`) must go through `lib/http/secure-mutation-route.ts`. The standard
order is request context and same-origin/CSRF validation, authenticated actor
check, route param and JSON body validation, declared authorization policy,
then handler work. Every mutating REST route must declare an `admin`,
`requirements`, or `custom` policy; logout uses the explicit
`secureLogoutMutationRoute` special case because it is an auth endpoint with
CSRF and audit but no business authorization policy. A unit coverage test scans
`app/api/**/route.ts` to keep this invariant in place.

Authorization denials from these policies are fail-closed into the database
action log before the denial response is returned. The action-log read
endpoint, `GET /api/admin/audit-events`, is Admin-only, read-only, `no-store`,
supports a validated `client_ip` filter alongside the other audit filters, and
intentionally does not create another action-log row.

`/api/mcp` is the intentional exception. It keeps validation inside its
JSON-RPC/MCP schema layer and uses Bearer-token authentication, so MCP tool
contracts remain the source of truth.

## Workflow

Workflow file:
[.github/workflows/security-api.yml](../.github/workflows/security-api.yml).

The workflow runs on pull requests to `main`, pushes to `main`, weekly
schedule, and manual dispatch. It uses `pull_request`, never
`pull_request_target`, and has only `contents: read` permission.

The workflow:

1. Installs Node dependencies with `npm ci`.
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

Start the app in another shell:

```bash
NODE_ENV=production BUILD_TARGET=local-prod \
  npx dotenv -e .env.prodlike -- \
  npx next start --hostname 127.0.0.1 --port 3001
```

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
  generated examples never log or expose raw target HSA-IDs in audit details.
  Data-subject export should remain outside this contract until the privacy
  route policy explicitly covers both self-export and `PrivacyOfficer`
  cross-user export.
