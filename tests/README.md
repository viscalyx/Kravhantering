# Tests

This folder contains the project's test suites and test-related documentation.

## Quick commands

See `package.json` for the full list of test-related scripts.

## Unit tests

- Location: `tests/unit`
- Start here: [tests/unit/test-helpers.ts](tests/unit/test-helpers.ts)
- Run with: `npm run test`

## Integration tests

- Location: `tests/integration`
- Overview/specs: [tests/integration/smoke.md](tests/integration/smoke.md)
- Error-boundary smoke tests and notes: [tests/integration/error-boundary-smoke.md](tests/integration/error-boundary-smoke.md)
- Global Playwright setup: [tests/integration/global-setup.ts](tests/integration/global-setup.ts)

Test-only routes (used to exercise App Router error boundaries) are gated
behind the `ENABLE_ERROR_BOUNDARY_TEST_ROUTE` environment variable. See
these locations:

- Gate in test pages: [app/[locale]/error-boundary-test/page.tsx](app/[locale]/error-boundary-test/page.tsx)
  and [app/[locale]/admin/error-boundary-test/page.tsx](app/[locale]/admin/error-boundary-test/page.tsx)
- Playwright/dev configs that enable the gate: [playwright.config.ts](playwright.config.ts)
  and [playwright.prodlike.config.ts](playwright.prodlike.config.ts)
- CI usage: [.github/workflows/integration-tests.yml](.github/workflows/integration-tests.yml)

> [!NOTE]
> The test-only pages call `notFound()` when the env var is not set, so
> they remain hidden in normal development and production builds.

## Quality / Spec audits

- Quality spec guidance: [tests/quality/QUALITY.md](tests/quality/QUALITY.md)

## Other notes

- Developer-mode and test infra notes live in `tests/integration` specs
  (see `developer-mode-overlay.md`) and in `playwright.prodlike.config.ts`
  where developer-mode surfaces are intentionally excluded for prodlike runs.
- The MCP seeded scan is prodlike-only. The dev Playwright config excludes
  `tests/integration/mcp-seeded-scan.spec.ts`; run it with
  `npm run test:integration:prodlike`.
- When running integration tests locally, ensure the IdP and database are
  available (see `npm run idp:up` and `npm run db:setup`).

## Release smoke tests

- Location: [tests/release-smoke](tests/release-smoke)
- Config: [playwright.release-smoke.config.ts](../playwright.release-smoke.config.ts)
- Run against a started container stack with:

```bash
npm run container:release-smoke:up
npm run test:release-smoke
npm run container:release-smoke:down
```

The suite signs in as `release-smoke-user` and `release-smoke-admin` through
the container Keycloak realm and verifies HTTPS, nginx, session reuse, seeded
SQL Server reads, one CSRF-protected write, static assets, `/build.json` and
HSA lookup through Kong plus the HSA directory mock.

In the devcontainer, stack startup trusts the generated container CA for Node
and Chromium. Other runners must trust `tmp/container-tls/ca.crt` themselves.

If you'd like this file expanded (e.g., a short how-to for writing new
Playwright specs, or CI troubleshooting steps), say which section to grow.
