# ZAP Full Active Scan

The full active ZAP workflow is an isolated, manual DAST run for destructive
scanner behavior such as SQL injection, XSS, path traversal, and form
submission probes. It is not a PR gate and is not scheduled until manual runs
have been triaged.

## Isolation

Workflow file:
[.github/workflows/security-dast-full.yml](../../.github/workflows/security-dast-full.yml).

The workflow starts only local services and fails before scanning unless
`APP_BASE_URL` is exactly `http://localhost:3001`. It generates a temporary
Keycloak realm under `test-results/security-dast-full/keycloak` with a single
throwaway user, `full.scan`, and points the app at that realm through
`AUTH_OIDC_ISSUER_URL`.

The app starts with `AI_REQUIREMENT_GENERATION_DISABLED=1` and empty OpenRouter
keys. REST and MCP AI-assisted authoring keep their public contracts, but
return the sanitized provider-unavailable response before OpenRouter catalog or
chat calls.

## Runbook

Run the workflow manually from GitHub Actions. Review these artifacts:

- `zap-full-authenticated` and `zap-full-unauthenticated` for HTML, Markdown,
  and JSON reports.
- `zap-full-app-log` for application errors during probing.
- `zap-full-db-backup` for the SQL Server backup captured after scanner
  mutations.

Treat findings as not triaged until confirmed against the app and not only the
scanner payload. Suppress local-only noise in
[.github/zap/rules.full.tsv](../../.github/zap/rules.full.tsv) with a clear
comment. Escalate actionable rules only after the first manual runs are stable.

## Scheduling

Keep the workflow manual until at least three successful manual runs have been
reviewed. To enable weekly scanning, add a Sunday `04:00 UTC` schedule to the
workflow and document the baseline decision in this page and
[security-ci.md](./security-ci.md).
