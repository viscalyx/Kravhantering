# MCP Seeded HTTP Security Gate

Phase 6 adds a repo-owned MCP seeded HTTP gate. It runs against the same
prodlike localhost stack as the REST API security workflow and exercises the
real `/api/mcp` Streamable HTTP endpoint with a local Keycloak
service-account Bearer token.

This is not a paid vendor DAST scan, not ZAP API scan, and not a general
crawler. MCP tool calls are JSON-RPC payloads on one route, so the useful
signal comes from a known request corpus and explicit assertions.

## Scope

Covered by Phase 6:

- Missing and invalid Bearer tokens return `401` with `WWW-Authenticate:
  Bearer` and a JSON-RPC error body.
- A valid local `kravhantering-mcp` token can connect to `/api/mcp`.
- The server exposes exactly the documented 11 MCP tools.
- The seeded corpus exercises read, requirement mutation, transition,
  specification add/remove, suggestion mutation, and AI-generation surfaces.
- Disposable test data is used for create, edit, stale edit, transition,
  archive, and suggestion checks.
- OpenRouter env vars are unset for the scan; AI generation must return the
  sanitized MCP error instead of succeeding.

Out of scope for Phase 6:

- HAR generation, production targets, production secrets, role-matrix DAST,
  active scanning, ZAP API scans, new MCP tools, schema changes, UI changes,
  RBAC rollout, and live OpenRouter provider calls.
- Closing issue `#119`. This phase creates more seeded MCP coverage for that
  later work.

Nuclei still owns the unauthenticated `/api/mcp` exposure check added in
Phase 4. The Phase 3 MCP unit/property tests remain the primary protocol and
authorization seam contract.

## OpenRouter Policy

Security CI deliberately does not call live OpenRouter endpoints. OpenRouter is
an external provider, and repo-owned security gates should not depend on its
availability, paid account state, rate limits, or production-like secrets.

The repository verifies its side of the contract instead:

- Unit tests cover request construction, response parsing, timeout behavior,
  and OpenRouter error handling with mocked network calls.
- MCP unit and seeded HTTP tests cover the MCP tool boundary and sanitized error
  behavior.
- The seeded HTTP scan runs with OpenRouter env vars unset; AI generation must
  fail safely and must not leak provider keys, prompts, SQL fragments, or stack
  traces.

## Local Run

Start from a disposable SQL Server database and local Keycloak realm:

```bash
cp .env.sqlserver.ci .env.sqlserver
npm run db:up
npm run db:setup
npm run idp:up
npm run build:local-prod
OPENROUTER_API_KEY= OPENROUTER_MGMT_API_KEY= \
  NODE_ENV=production BUILD_TARGET=local-prod \
  npx dotenv -e .env.prodlike -- \
  npx next start --hostname 127.0.0.1 --port 3001
```

In another shell, run:

```bash
MCP_BEARER_TOKEN="$(node scripts/security/get-mcp-token.mjs)" \
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_SKIP_AUTH_SETUP=1 \
npm run test:integration:prodlike -- tests/integration/mcp-seeded-scan.spec.ts
```

The helper defaults match the committed dev realm:

```text
AUTH_OIDC_ISSUER_URL=http://localhost:8080/realms/kravhantering-dev
MCP_CLIENT_ID=kravhantering-mcp
MCP_CLIENT_SECRET=dev-only-mcp-secret
```

These are local development values only. Do not replace them with production
client credentials.

In GitHub Actions, the workflow sets
`AUTH_OIDC_ISSUER_URL=http://127.0.0.1:8080/realms/kravhantering-dev` for this
machine-to-machine scan and waits for both discovery and JWKS before starting
the MCP corpus. Local browser-oriented prodlike runs can keep the default
`localhost` issuer.

## Artifacts

The workflow uploads:

- `mcp_seeded_scan` with `test-results/mcp-seeded/events.ndjson` and
  `summary.md`.
- `security-mcp-app-log` with the local prodlike app log.

The scan and workflow must not write Bearer tokens, JWTs, client secrets,
OpenRouter keys, SQL fragments, or stack traces to artifacts.

## Failure Policy

The workflow fails after artifact upload when any of these happen:

- Target is not exactly `http://localhost:3001`.
- The MCP token cannot be acquired.
- Missing or invalid Bearer token checks return 2xx.
- The tool allowlist differs from the documented 11 tools.
- A positive seeded call returns MCP `isError`, transport failure, or
  unexpected 5xx.
- A mutation fails to preserve the expected safety behavior.
- Output contains sensitive values or internal error details.
- AI generation succeeds while OpenRouter env vars are unset.

Allowed expected negatives are limited to missing or invalid Bearer tokens,
unknown tool, stale edit conflict, and sanitized AI-disabled error.

## Extending The Corpus

Add new MCP cases in `tests/fixtures/mcp-requests/` and wire the deterministic
runtime assertions in `tests/integration/mcp-seeded-scan.spec.ts`.

When adding a case:

- Resolve IDs from the seeded database at runtime.
- Use disposable data for destructive or state-changing checks.
- Keep the scan target localhost-only.
- Do not add production secrets or external service tokens.
- Keep OpenRouter calls disabled in security scans. Add mocked unit coverage
  for client or prompt changes instead of calling the live provider from CI.
