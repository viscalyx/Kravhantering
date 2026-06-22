# ZAP API Security Scan

The ZAP API workflow runs `zaproxy/action-api-scan` against a filtered
read-only OpenAPI document generated from
[openapi/requirements-api.yaml](../../openapi/requirements-api.yaml). The
static OpenAPI file remains the source of truth; the generated
`test-results/security-dast-api/openapi.json` is a CI artifact, not a committed
contract.

## Scope

The generator lives in
[scripts/security/generate-zap-api-openapi.mjs](../../scripts/security/generate-zap-api-openapi.mjs).
Its allowlist starts with authenticated read-only operations such as
requirements list/detail and lookup catalogs. Mutating operations stay out of
scope until their CSRF headers, examples, and expected state changes are
curated for active API probing.

`/api/mcp` remains outside this REST OpenAPI contract. MCP security coverage is
owned by the seeded MCP workflow and MCP contract tests because the endpoint is
a JSON-RPC transport, not a REST operation set.

## Workflow

Workflow file:
[.github/workflows/security-dast-api.yml](../../.github/workflows/security-dast-api.yml).

The workflow runs on pull requests that touch API/security-contract paths and
on manual dispatch. It starts the shared localhost prodlike stack, logs in as
`ada.admin`, generates the filtered OpenAPI JSON, guards that the target is
exactly `http://localhost:3001`, and runs ZAP API scan with the browser session
cookie injected through the ZAP replacer add-on.

The workflow uploads the ZAP reports, generated OpenAPI JSON, and app log. ZAP
built-in issue writing stays disabled; findings are reviewed from artifacts.

## Adding Operations

Add operations only when they are safe for active API probes against the
disposable prodlike database.

1. Add or update the route contract in `openapi/requirements-api.yaml`.
2. Add the read-only operation to the allowlist in
   `scripts/security/generate-zap-api-openapi.mjs`.
3. Add or update unit coverage in
   `scripts/security/__tests__/generate-zap-api-openapi.test.mjs`.
4. Tune [.github/zap/rules.api.tsv](../../.github/zap/rules.api.tsv) only with
   a documented reason for every rule action.
