---
name: run-and-fix-integration-tests
description: >-
  Run and repair Playwright integration tests in focused phases with spec-only
  edits. Use when asked to run, triage, or fix
  `npm run test:integration`, `npm run test:integration:prodlike`, or
  specific `tests/integration/**/*.spec.ts` failures.
---

# Run And Fix Integration Tests/

Use /caveman for dialogs, normal mode for reports and changes.

## Scope

- Run the suite the user requested.
- If no suite is named, run dev first, then prodlike.
- Treat user-provided spec paths as the initial phase list.
- If no spec path is provided, prefer memory-safe chunks over one monolithic
  full-suite run. Only run a full suite in one process when the user explicitly
  asks for it or memory headroom is clearly safe.
- Keep each failing spec file as one phase.
- Edit only `tests/integration/**/*.spec.ts` files.
- Do not run a full suite while fixing a phase.
- Do not abort or restart a slow test only because it exceeds an arbitrary
  duration; passing completion matters. Abort only when the test is not
  responding, the runner is stuck, or memory pressure risks killing the
  devcontainer.

## Commands

- Dev full suite: `npm run test:integration`
- Dev spec phase: `npm run test:integration -- <spec>`
- Prodlike full suite: `npm run test:integration:prodlike`
- Prodlike spec phase: `npm run test:integration:prodlike -- <spec>`
- Prodlike memory-safe setup:
  - Build once: `npm run build:local-prod`
  - Start the built server with test routes enabled:
    `ENABLE_ERROR_BOUNDARY_TEST_ROUTE=1 npm run start:prodlike-pruned`
  - Seed prodlike auth against the external server on the first chunk:
    `PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_FORCE_AUTH_SETUP=1 npx playwright test --config=playwright.prodlike.config.ts <chunk>`
  - Run later chunks without rebuilding:
    `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --config=playwright.prodlike.config.ts <chunk>`

## Memory-Safe Chunks

Use chunks that keep related files together but allow the app server and
Playwright runner to release memory between runs.

Generate chunks with:

- Dev: `node .github/skills/run-and-fix-integration-tests/scripts/get-integration-chunks.mjs --suite dev`
- Prodlike: `node .github/skills/run-and-fix-integration-tests/scripts/get-integration-chunks.mjs --suite prodlike`

The script is required. Do not hand-build chunks unless the user explicitly
asks for a custom run. The script discovers current specs, skips suite-ignored
specs, groups areas into memory-safe chunks, includes every eligible discovered
area exactly once, and prints runnable commands. Use `--format json` when you
need structured output.

Between chunks:

- Check memory when the user reports pressure, or when dev-server memory is
  known to climb.
- Stop leftover dev servers with `npm run kill:port` before starting another
  dev chunk if port 3000 is still bound.
- Treat aggregate chunk success as equivalent coverage to one full suite run
  when a monolithic run would exhaust the devcontainer.

## Workflow

1. Build the phase list:
   - User supplied paths: use those spec files.
   - No paths: run the selected suite in memory-safe chunks and collect
     failing spec files. If a full run was explicitly requested and memory is
     safe, run the full suite once instead.
2. Pick one failing spec file.
3. Re-run only that spec with the matching phase command.
4. Inspect Playwright output, traces, screenshots, console errors, and logs.
5. Fix the smallest spec defect that explains the failure.
6. Re-run the same spec until it passes.
7. Repeat steps 3-7 for each failing spec file.
8. Run the selected suite after all known phases pass, using memory-safe chunks
   when a monolithic full suite risks devcontainer exhaustion.
9. If new spec files fail, repeat from step 2.
10. If dev and prodlike are both in scope, finish dev before starting prodlike.

## Fix Rules

- Prefer current product behavior and repository docs over stale test
  expectations.
- Do not weaken assertions, add arbitrary waits, or skip tests to hide
  failures.
- Use Playwright locator, navigation, and state waits instead of fixed
  timeouts.
- Treat env-only failures as setup issues before changing spec code.
- Do not edit production code, including application, component, hook, runtime
  library, translation, config, migration, or seed files.
- If a production change is required, write a detailed report in a temporary file.
  - Group the report by failing spec file.
  - For each spec group, include the command, failure evidence, suspected
    production files or symbols, required behavior change, and blocked tests.
- Continue with remaining spec-only phases after writing the report.
- Respect Playwright config differences between dev and prodlike runs.
- Report final pass/fail status and the exact commands run.
