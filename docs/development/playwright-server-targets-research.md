# Playwright Server Target Research

Date: 2026-07-02

## Question

Should this repo run Playwright integration tests against both the Next.js
development server and a production-like built server, or should one target be
preferred?

## Findings

- Next.js separates the server modes: `next dev` starts development mode with
  Hot Module Reloading and error reporting, `next build` creates an optimized
  production build, and `next start` starts production mode after `next build`.
  The development output also goes to `.next/dev`, separate from production
  `.next` output. Source: [Next.js CLI docs][next-cli].
- The official Next.js Playwright guide says the Next.js server must be running
  for Playwright tests and recommends running tests against production code so
  the test target more closely resembles application behavior. It gives the
  sequence `npm run build`, `npm run start`, then `npx playwright test`.
  Source: [Next.js Playwright guide][next-playwright].
- The official Next.js production guide says to run `next build` locally to
  catch build errors and then `next start` to measure the application in a
  production-like environment before going to production. Source:
  [Next.js production guide][next-production].
- Playwright's `webServer` configuration can launch a local server before the
  tests. Playwright describes this as ideal while writing tests during
  development and when there is no staging or production URL to test against.
  Source: [Playwright web server docs][playwright-webserver].
- Playwright's CI guide describes installing dependencies and browsers, then
  running the Playwright suite in CI. It recommends `workers: 1` in CI for
  stability and reproducibility, with sharding as the scale-out option. Source:
  [Playwright CI docs][playwright-ci].
- This repo currently has separate npm scripts for the two Playwright suites:
  `npm run test:integration` runs the `dev` suite, and
  `npm run test:integration:prodlike` runs the `prodlike` suite. The
  production-like script `start:prodlike-pruned` starts Next.js with
  `NODE_ENV=production`, `BUILD_TARGET=local-prod`, `.env.prodlike`, and
  `next start` on port `3001`. Source: [package.json](../../package.json).
- This repo's integration-test workflow currently runs a `test-server` matrix
  against both dev and prod-like servers, and a separate `test-prodlike-pruned`
  job that builds the prod-like bundle, installs production-only dependencies,
  starts `start:prodlike-pruned`, and runs the prod-like Playwright suite.
  Source: [integration-tests.yml](../../.github/workflows/integration-tests.yml).

## Recommendation

Prefer the production-like built server as the canonical required CI target for
the full Playwright integration/end-to-end suite. For this repo, the strongest
required gate is the pruned production-like path: build with `build:local-prod`,
serve with `start:prodlike-pruned`, and run
`npm run test:integration:prodlike`. This matches the Next.js recommendation to
test Playwright against production code and also verifies that the built app can
run after development dependencies are absent.

Do not treat a full duplicate run against `npm run dev` as the general best
practice. Use the dev server for local authoring, debugging, Playwright UI
mode, and targeted checks for dev-only behavior such as Developer Mode,
Turbopack development routing, or other surfaces intentionally absent from
production-like builds.

If CI cost or duration matters, the first consolidation candidate is to stop
requiring three full server-target executions. Keep the pruned production-like
run as required. Then either keep a small dev-server smoke suite for dev-only
coverage, move the full dev-server suite to a scheduled/manual job, or require
it only for changes that touch dev-only infrastructure.

## Source URLs

- [Playwright web server docs][playwright-webserver]
- [Playwright CI docs][playwright-ci]
- [Next.js Playwright guide][next-playwright]
- [Next.js CLI docs][next-cli]
- [Next.js production guide][next-production]

[playwright-webserver]: https://playwright.dev/docs/test-webserver
[playwright-ci]: https://playwright.dev/docs/ci
[next-playwright]: https://nextjs.org/docs/app/guides/testing/playwright
[next-cli]: https://nextjs.org/docs/app/api-reference/cli/next
[next-production]: https://nextjs.org/docs/app/guides/production-checklist
