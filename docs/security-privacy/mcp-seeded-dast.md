# MCP Seeded HTTP Security Gate

This guide is for developers running, diagnosing, or extending the MCP
security gate in [Security MCP](../../.github/workflows/security-mcp.yml).

The repo-owned MCP seeded HTTP gate runs against the same prodlike localhost
stack as the REST API security workflow and exercises the real `/api/mcp`
Streamable HTTP endpoint with a local Keycloak service-account Bearer token.

This is not a paid vendor DAST scan, not ZAP API scan, and not a general
crawler. MCP tool calls are JSON-RPC payloads on one route, so the useful
signal comes from a known request corpus and explicit assertions.

## Scope

Covered by this workflow:

- Missing and invalid Bearer tokens return `401` with
  `WWW-Authenticate: Bearer`. The missing-token check also verifies a
  JSON-RPC error body.
- A valid local `kravhantering-mcp` token can connect to `/api/mcp`.
- The server exposes exactly the documented MCP tool allowlist.
- The seeded corpus exercises read, requirement mutation, transition,
  specification add/remove, suggestion mutation, reference listing, and
  import schema, instruction, destination, validation, and inspection surfaces.
- Disposable test data is used for create, edit, stale edit, transition,
  archive, and suggestion checks.

The corpus does not establish full coverage of every operation on the tool
allowlist. In particular, import execution, import-session ownership and quota
races, and a full role matrix need separate tests. Nuclei owns the
unauthenticated `/api/mcp` exposure check; MCP unit/property tests cover
protocol and authorization contracts.

## OpenRouter Policy

Security CI deliberately does not call live OpenRouter endpoints. The workflow
clears `OPENROUTER_API_KEY` and `OPENROUTER_MGMT_API_KEY` for the app and scan.
The current MCP corpus does not call an AI authoring tool or assert an
AI-disabled error. Keep provider tests mocked rather than adding external
provider dependencies or secrets to this gate.

## Local Run

Use the existing local SQL Server and Keycloak services with a disposable,
migrated and seeded database. Follow the
[SQL Server developer workflow](../development/sql-server-developer-workflow.md)
for database configuration and the
[authentication developer workflow](../development/auth-developer-workflow.md)
for the committed local realm. The scan creates and changes data; do not target
a database whose contents must be preserved. Do not overwrite an existing
`.env.sqlserver` with CI settings or reset a shared development realm.

Ensure the app's database connection points to that disposable database, then
build and launch it from the repository root:

```bash
npm run build:local-prod
OPENROUTER_API_KEY= OPENROUTER_MGMT_API_KEY= npm run start:prodlike-pruned
```

The launcher stages the standalone runtime assets and binds the server to
`127.0.0.1:3001`.

In another shell, run:

```bash
MCP_BEARER_TOKEN="$(MCP_CLIENT_ID=kravhantering-mcp \
  AUTH_MCP_REQUIRED_SCOPES=kravhantering:mcp \
  node scripts/security/get-mcp-token.mjs)" \
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_SKIP_AUTH_SETUP=1 \
npm run test:integration:prodlike -- \
  --config=playwright.security-mcp.config.ts \
  tests/integration/mcp/seeded-scan.spec.ts
```

The local configuration below matches the committed dev realm. The token
helper requires `MCP_CLIENT_ID` and `AUTH_MCP_REQUIRED_SCOPES`; the command
above supplies them. The other values shown are helper defaults:

```text
AUTH_OIDC_ISSUER_URL=http://localhost:8080/realms/kravhantering-dev
MCP_CLIENT_ID=kravhantering-mcp
AUTH_MCP_REQUIRED_SCOPES=kravhantering:mcp
AUTH_MCP_ROLES_CLAIM=roles
AUTH_MCP_TOKEN_MAX_AGE_SECONDS=300
MCP_CLIENT_SECRET=dev-only-mcp-secret
```

These are local development values only. Do not replace them with production
client credentials.

The committed dev realm emits local `Admin` and `Reviewer` roles as a JSON-array
`roles` claim for the `kravhantering-mcp` service token.
Those local-only roles let the corpus exercise requirement writes,
specification add/remove, and reviewer transitions through the same production
authorization checks without depending on assignment-specific seed rows.

In GitHub Actions, the workflow sets
`AUTH_OIDC_ISSUER_URL=http://127.0.0.1:8080/realms/kravhantering-dev` for this
machine-to-machine scan. Its stack action starts Keycloak with
`npm run idp:reset` and waits for discovery and JWKS before starting the corpus.
Local browser-oriented prodlike runs can keep the default `localhost` issuer.

## Artifacts

The workflow uploads:

- `mcp_seeded_scan` with `test-results/mcp-seeded/events.ndjson` and
  `summary.md`.
- `security-mcp-app-log` with the local prodlike app log.

The scan and workflow must not write Bearer tokens, JWTs, client secrets,
OpenRouter keys, stored import content, SQL fragments, or stack traces to
artifacts. Check the job outcome as well as `summary.md`: the separate import
validation inspection test runs after the main corpus writes its summary.

## Failure Policy

The workflow fails after artifact upload when any of these happen:

- Target is not exactly `http://localhost:3001`.
- The MCP token cannot be acquired.
- Missing or invalid Bearer token checks fail their expected `401` response.
- The tool allowlist differs from `expected-tools.json` (currently 17 tools).
- A positive seeded call returns MCP `isError`, transport failure, or
  unexpected 5xx.
- A mutation fails to preserve the expected safety behavior.
- Output contains sensitive values or internal error details.

Allowed expected negatives are limited to missing or invalid Bearer tokens,
unknown tool and stale edit conflict.

## Extending The Corpus

Add new MCP cases in `tests/fixtures/mcp-requests/` and wire the deterministic
runtime assertions in `tests/integration/mcp/seeded-scan.spec.ts`.

When adding a case:

- Resolve IDs from the seeded database at runtime.
- Use disposable data for destructive or state-changing checks.
- Keep the scan target localhost-only.
- Do not add production secrets or external service tokens.
- Keep OpenRouter calls disabled in security scans. Add mocked unit coverage
  for provider client or prompt changes.
