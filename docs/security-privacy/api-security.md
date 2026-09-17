# REST API Security Scan

<!-- cSpell:ignore Schemathesis -->

This guide is for developers maintaining the REST contract or investigating a
Security API workflow failure. The scan uses a static OpenAPI contract and
bounded Schemathesis requests against a disposable prodlike app: SQL Server,
Keycloak, and Next.js on `http://localhost:3001`.

## Scope

The static contract lives in
[openapi/requirements-api.yaml](../../openapi/requirements-api.yaml). It is the
operation-level source of truth for scan coverage, parameters and responses;
it is not served by the app. The `contract: openapi` declarations in
`lib/http/route-security-policy.ts` must match it exactly. Other REST operations
use `contract: focused` and stay outside Schemathesis.

The covered surface includes:

- Session projection and HSA person-lookup capability reads.
- Privacy erasure preview, erasure execution and data-subject export.
- Requirement list, detail, create, edit, archive, version read, delete-draft,
  restore, reactivate and transition operations, plus the library CSV export.
- Specification agreement reads and mutations, bounded item collection reads,
  and the specification-scoped requirement-package catalog read.
- Improvement-suggestion implementation attachment.
- Requirement-area stewardship and catalog reads, including requirement areas,
  categories, types, statuses, packages, quality characteristics, priority
  levels and norm references; norm-reference archive/reactivate mutations.

Use disposable seeded HSA-ids for privacy examples. The scan actor `ada.admin`
has both `Admin` and `PrivacyOfficer`. Erasure execution can encounter stale
preview tokens during generated requests; `409` is an expected outcome.
Agreement decisions still require the assigned responsible person; Admin does
not bypass that authorization. A successful admin scan alone therefore cannot
prove role or assignment isolation.

The following surfaces use focused coverage because schema fuzzing does not
exercise their main risks:

- Operational probes and database-schema diagnostics: availability, restricted
  diagnostics and sanitized responses.
- Other CSV/PDF/report routes, including specification exports and the Admin
  action-log endpoint: exact output, bounded traversal, authorization before
  reading data and privacy-safe capacity failures.
- AI generation, repair, discovery and administration: streaming, provider
  calls, secret handling, byte limits and configuration state transitions.
  Generated scan traffic must not invoke external providers.
- Admin settings, catalog mutations other than the covered norm-reference
  actions, access reviews and co-author management: role/assignment isolation,
  conflicts, configuration precedence and audit redaction.
- Requirement selections, saved answers, imports and other specification
  routes, including RFI assessments: workflow state, preview tokens,
  assignment authorization, concurrency and local-versus-library semantics.
- Deviation and improvement-suggestion workflows other than the covered
  implementation attachment and agreement operations: decision permissions,
  lifecycle transitions and transactional evidence.
- HSA person verification: upstream lookup, shared quotas and evidence bound to
  caller, target, purpose, scope and expiry. The capability read is covered;
  verification and final assignment need focused tests.
- Native CSP reports: anonymous browser telemetry uses a distinct transport
  policy, described below.
- `/api/mcp`: Bearer-token JSON-RPC authentication, payload bounds and MCP
  schemas/tool contracts are tested separately from REST.

For browser crawling, active DAST and authorization checks across roles, see
[Security CI](./security-ci.md). Those checks complement this contract scan.

## Runtime Validation

Covered JSON REST routes validate caller-controlled path parameters, query
parameters and bodies with shared Zod schemas in `lib/http/validation.ts`.
Malformed JSON and invalid schema input return a typed `400` response:

```json
{
  "error": "Invalid request",
  "issues": [{ "path": "id", "code": "invalid_format", "message": "..." }]
}
```

Strict schemas reject unknown fields. IDs, strings and arrays have explicit
bounds; query booleans use the representation declared by the operation.
Authentication, CSRF and authorization may reject a request before a validation
error is returned. Keep expected rejection statuses in the OpenAPI contract
instead of interpreting every generated invalid request as a server defect.

The registry supplies auth, CSRF, sensitivity and cache policy to the proxy and
route wrappers. Sensitive responses use `no-store`, including error responses.
Session mutations require same-origin CSRF checks and an explicit authorization
policy through `secureMutationRoute`. Logout uses
`secureLogoutMutationRoute`; native CSP telemetry uses `nativeCspReportRoute`.
MCP is outside the REST registry. See
[REST Route Authoring](../development/rest-route-authoring.md) for the required
wrappers and registry/OpenAPI synchronization checklist.

Authorization denials requiring action-log evidence block handler work. If
that evidence cannot be persisted, the route returns a generic `500` rather
than proceeding without it. Investigate database/audit failures when this
appears during a scan; do not add successful mutation behavior to the contract
for that condition.

## Workflow

Workflow file:
[.github/workflows/security-api.yml](../../.github/workflows/security-api.yml).

The workflow is triggered by pull requests to `main`, pushes to `main`, a
weekly schedule, and manual dispatch. Validation selection determines whether
the API scan job is applicable; the result job reports that decision. It uses
`pull_request`, never `pull_request_target`, and has only `contents: read`
permission.

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

- `Cookie: __Host-kravhantering_session=...`
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

Use a running disposable prodlike SQL Server/Keycloak stack with seeded test
identities and the app at `http://localhost:3001`. The scan issues mutations,
including erasure requests; its database must contain only disposable data.
Check the target database before running it. Follow the
[SQL Server developer workflow](../development/sql-server-developer-workflow.md)
for database setup and the
[authentication developer workflow](../development/auth-developer-workflow.md)
for Keycloak setup.

Keep `.env.sqlserver` and `.env.development.local` unchanged. Do not run CI's
clean/setup/teardown sequence against shared development services. If a
separate stack is needed, use isolated container names, networks, volumes and
unused ports, with command-scoped connection settings. If a suitable local
stack is unavailable, the `Security API` workflow is the verification gate.

Build the app with `npm run build:local-prod`, then start it in another shell
with `npm run start:prodlike-pruned`. The start command serves the standalone
build on `127.0.0.1:3001` with its public and generated static assets. Skip
these steps if the matching prodlike app is already running.

Install and run the pinned scanner from the repository root:

<!-- markdownlint-disable MD013 -->

```bash
python -m pip install "schemathesis==4.15.2"
mkdir -p test-results/schemathesis
COOKIE="$(APP_BASE_URL=http://localhost:3001 node scripts/security/get-session-cookie.mjs ada.admin)"
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
unset COOKIE
```

<!-- markdownlint-enable MD013 -->

Stop only the app and disposable services you started for this run. Leave
shared development services running.

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

## Export and report admission contract

See [export and report admission](../operations/export-report-admission.md) for
covered routes, shared actor limits, distinct 429/503 reasons, English and
Swedish messages, privacy handling and coordinated operational tuning.

The library CSV and data-subject JSON/PDF exports are covered by Schemathesis.
Their contract includes actor and service-capacity `429` responses,
bounded-output `422` responses and temporary `503` failures. The library CSV
contract also allows Node's `431` response for an oversized request target.
Keep these expected failures route-specific; do not relax status conformance
for unrelated operations. Other export/report and admin setting operations
retain focused coverage outside Schemathesis.

## Native CSP report transport

`POST /api/security/csp-reports` stays outside Schemathesis. Its native browser
report envelopes and delivery use receiver/privacy tests and browser coverage.
Its exact `native-csp-report` policy permits anonymous, bounded telemetry
without `X-Requested-With`; attached cookies confer no identity. This exception
does not apply to ordinary session mutations. See
[ADR 0062](../adr/0062-anonym-native-csp-rapportering.md) and the
[collector contract](../operations/csp-reporting.md).
