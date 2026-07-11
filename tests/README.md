# Tests

This folder contains the project's test suites and test-related documentation.

## Quick commands

See `package.json` for the full list of test-related scripts.

## Unit tests

- Location: `tests/unit`
- Start here: [unit/test-helpers.ts](unit/test-helpers.ts)
- Run with: `npm run test`

## Integration tests

- Location: `tests/integration`
- Overview/specs: [platform smoke test](integration/platform/smoke.spec.ts)
- Error-boundary smoke tests: [error-boundary smoke test](integration/platform/error-boundary-smoke.spec.ts)
- Global Playwright setup: [integration/global-setup.ts](integration/global-setup.ts)
- Chunk manifest: [integration-chunks.manifest.json](integration-chunks.manifest.json)

`npm run test:integration` and `npm run test:integration:prodlike` run the
Playwright suite locally in deterministic chunks by default. Run a single
chunk with:

```bash
npm run test:integration -- --chunk dev-requirement-selection
npm run test:integration:prodlike -- --chunk prodlike-mcp-seeded-scan
```

Passing a spec path still runs a direct Playwright invocation for debugging:

```bash
npm run test:integration -- tests/integration/requirements/library.spec.ts
```

In CI, the required full-suite Playwright gate is the pruned prodlike target in
[`.github/workflows/integration-tests.yml`](../.github/workflows/integration-tests.yml).
The same workflow keeps a small dev-server smoke for Developer Mode and local
dev-server startup behavior; it does not run the full dev-server suite on every
pull request.

When specs move or are added, refresh and verify the committed chunk manifest:

```bash
npm run test:integration:chunks:generate
npm run test:integration:chunks:check
```

Test-only routes (used to exercise App Router error boundaries) are gated
behind the `ENABLE_ERROR_BOUNDARY_TEST_ROUTE` environment variable. See
these locations:

- Gate in test pages: [app/[locale]/error-boundary-test/page.tsx](../app/[locale]/error-boundary-test/page.tsx)
  and [app/[locale]/admin/error-boundary-test/page.tsx](../app/[locale]/admin/error-boundary-test/page.tsx)
- Playwright/dev configs that enable the gate: [playwright.config.ts](../playwright.config.ts)
  and [playwright.prodlike.config.ts](../playwright.prodlike.config.ts)
- CI usage: [.github/workflows/integration-tests.yml](../.github/workflows/integration-tests.yml)

> [!NOTE]
> The test-only pages call `notFound()` when the env var is not set, so
> they remain hidden in normal development and production builds.

## Quality / Spec audits

- Quality spec guidance: [quality/QUALITY.md](quality/QUALITY.md)

## Other notes

- Developer-mode and test infra notes live in `tests/integration` specs
  (see `developer-mode/overlay.spec.ts`) and in `playwright.prodlike.config.ts`
  where developer-mode surfaces are intentionally excluded for prodlike runs.
- The MCP seeded scan is prodlike-only. The dev Playwright config excludes
  `tests/integration/mcp/seeded-scan.spec.ts`; run it with
  `npm run test:integration:prodlike`.
- When running integration tests locally, ensure the IdP and database are
  available (see `npm run idp:up` and `npm run db:setup`).

## Release smoke tests

- Location: [release-smoke/release-smoke.md](release-smoke/release-smoke.md)
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
