# ZAP API Security Scan

This guide is for developers maintaining API scan coverage and reviewers
investigating failures in the `Security DAST API` workflow.

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
requirements list/detail and lookup catalogs. Mutating operations are outside
the current scan scope. The allowlist restricts imported operations; active
probes can still request paths outside that contract.

`/api/mcp` remains outside this REST OpenAPI contract. MCP security coverage is
owned by the [seeded MCP workflow](./mcp-seeded-dast.md) and MCP contract tests
because the endpoint is a JSON-RPC transport, not a REST operation set.

## Workflow

Workflow file:
[.github/workflows/security-dast-api.yml](../../.github/workflows/security-dast-api.yml).

The workflow starts on pull requests targeting `main` and on manual dispatch.
PR scan execution is selected by the shared validation selector; the `ZAP API`
check reports the selection and result. Manual dispatch selects the scan
regardless of changed paths.

When selected, it starts the shared localhost prodlike stack, logs in as
`ada.admin`, generates the filtered OpenAPI JSON, guards that the target is
exactly `http://localhost:3001`, and runs ZAP API scan with the browser session
cookie injected through the ZAP replacer add-on. This covers an administrator
session; it does not establish authorization coverage for other roles.

To investigate a failure, open the workflow run and review `zap-api-scan` for
ZAP reports, `zap-api-openapi` for the exact imported contract, and
`zap-api-app-log` for application errors. If scanning never starts, inspect the
failed setup, login, or target-guard step. ZAP built-in issue writing stays
disabled. A failed scan step fails the job after diagnostic uploads; its
`continue-on-error` setting does not make scan failures non-blocking.

The API rules file keeps localhost-only transport warnings non-blocking. Rule
`100001` is downgraded to artifact-only because active API probing can generate
unknown page and API paths that return framework `404` responses outside the
filtered OpenAPI contract.

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
