# Browser-Driven Guide Generation

Browser-driven documentation generators are scripts. The user-guide entry
point is `scripts/guide/generate-guide.ts`. It uses Playwright Test for browser
fixtures, authenticated state, assertions, steps, reports, screenshots, and
traces. Its single scenario generates documentation and mutates seeded data;
it is a one-shot workflow outside the repeatable integration suite.

## Naming and Discovery

Place future generators in a purpose-specific `scripts/<purpose>/` directory
with an explicit `generate-<artifact>.ts` entry point. Give each generator a
dedicated Playwright configuration that selects its entry point explicitly.
Keep helper modules beside the script without including them in discovery.

The user guide uses `playwright.guide.config.ts`:

```typescript
testDir: './scripts/guide',
testMatch: '**/generate-guide.ts',
```

Playwright supports custom filenames through
[`testMatch`](https://playwright.dev/docs/api/class-testconfig#test-config-test-match).
The runner's `test()` and `test.step()` APIs provide orchestration and reporting;
they do not classify this script as an integration test. Generator entry points
have no `.spec.ts` or `.test.ts` suffix, so Vitest does not collect them. Both
integration configurations restrict discovery to `tests/integration/`.
The app container build context excludes `scripts/guide/` alongside the test
helpers and documentation that it uses.

## Generate the User Guide

Use the local development environment with SQL Server and the development
Keycloak realm available. Follow the
[SQL Server workflow](sql-server-developer-workflow.md) and
[authentication workflow](auth-developer-workflow.md) for setup.

From the repository root, run:

```sh
npm run generate:guide
```

This command frees the development port, runs `npm run db:setup` to reset,
migrate, and seed the development database, then runs the dedicated Playwright
configuration. Use a disposable development database: the script creates
requirements, suggestions, and deviations. Run `npm run db:setup` afterward
to restore seed state before resuming development or integration tests,
including after a failed generation. Every fresh generation also starts with
that reset.

The shared `tests/integration/global-setup.ts` authenticates through Keycloak;
the guide uses the `ada.admin` session at `test-results/auth/admin.json`.
The runner uses desktop Chromium at 1440 × 1200, serial execution, one worker,
zero retries, and a ten-minute scenario timeout.

By default Playwright starts or reuses `npm run dev` at `http://localhost:3000`.
`PLAYWRIGHT_BASE_URL` overrides the browser target. With
`PLAYWRIGHT_SKIP_WEBSERVER=1`, start the target server separately and supply
the shared setup's cached role storage states, or set
`PLAYWRIGHT_FORCE_AUTH_SETUP=1` to obtain fresh sessions against that server.
The npm command still performs port cleanup and database setup.

Outputs stay at these locations:

- `docs/user-guide/README.md`: generated Swedish guide.
- `docs/user-guide/images/`: guide screenshots.
- `playwright-report-guide/`: HTML execution report.
- `test-results/guide/`: runner artifacts, including scenario screenshots
  on every run and traces retained on failure.

Open the report with:

```sh
npm run generate:guide:report
```

## Verify Discovery

These commands list scenarios without starting browsers or resetting data:

```sh
npx playwright test --config playwright.guide.config.ts --list
npx vitest list --filesOnly
npx playwright test --config playwright.config.ts --list
npx playwright test --config playwright.prodlike.config.ts --list
```

The guide configuration must list exactly the existing `Generera användarguide`
scenario. A neighboring helper module must not be discovered. Unit and
integration discovery must exclude the generator. When changing the generator
location or configuration, also run `npm run generate:guide` on the seeded
development environment to verify authentication and generated artifacts.
