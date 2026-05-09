# REST API Security Scan

<!-- cSpell:ignore Schemathesis -->

Phase 5 adds a repo-owned REST API contract and a bounded Schemathesis scan.
The scan runs against the same local prodlike app shape used by the DAST
workflow: SQL Server, Keycloak, and Next.js on `http://localhost:3001`.

## Scope

The static contract lives in
[openapi/requirements-api.yaml](../openapi/requirements-api.yaml). It documents
current JSON behavior for the browser-backed requirements REST API. The file is
not served by the app and does not add a runtime `/openapi` route.

Covered in Phase 5:

- `/api/auth/me`
- Requirement list, detail, create, edit, archive, version read,
  delete-draft, restore, reactivate, and transition routes.
- Read-only requirement catalog routes used by the requirements UI.

Deferred from Phase 5:

- CSV export, MCP, AI routes, admin catalog mutations, specifications,
  deviations, and improvement suggestions.
- ZAP API scan, role-matrix DAST, full active scans, and paid vendor scanners
  that require service-specific CI secrets.

Those deferred items are later issue `#119` work.

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
9. Runs Schemathesis with deterministic, bounded settings.
10. Uploads JUnit, NDJSON, stdout/stderr, and app logs even on failure.

The mutating scan requests include:

- `Cookie: kravhantering_session=...`
- `Origin: http://localhost:3001`
- `X-Requested-With: XMLHttpRequest`

The cookie is masked in workflow logs. Schemathesis output sanitization remains
enabled and HAR export is intentionally not used in Phase 5.

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
  --generation-database :memory: \
  --request-timeout 5 \
  --request-retries 0 \
  --rate-limit 30/m \
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
