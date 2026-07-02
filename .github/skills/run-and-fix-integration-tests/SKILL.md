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

- Dev suite, chunked by default: `npm run test:integration`
- Dev chunk phase: `npm run test:integration -- --chunk <chunk-id>`
- Dev spec phase: `npm run test:integration -- <spec>`
- Prodlike suite, chunked by default: `npm run test:integration:prodlike`
- Prodlike chunk phase:
  `npm run test:integration:prodlike -- --chunk <chunk-id>`
- Prodlike spec phase: `npm run test:integration:prodlike -- <spec>`
- List chunks:
  - Dev: `node tests/integration-chunks.mjs list --suite dev`
  - Prodlike: `node tests/integration-chunks.mjs list --suite prodlike`
- Refresh the chunk manifest after adding, moving, renaming, or deleting
  `tests/integration/**/*.spec.ts` files:
  `npm run test:integration:chunks:generate`

## Memory-Safe Chunks

Use chunks that keep related files together but allow the app server and
Playwright runner to release memory between runs.

The npm integration scripts are the source of truth for chunked execution. Never call Playwright directly for full-suite or chunked runs. The runner must be used because it enforces the
committed deterministic chunk manifest, fails fast when the manifest is stale,
keeps app-server lifetimes memory-safe between chunks, and emits memory and
app-server log-path diagnostics that are needed to debug intermittent resource
exhaustion.

Between chunks:

- Check memory when the user reports pressure, or when dev-server memory is
  known to climb. The chunk runner prints memory snapshots automatically.
- Treat aggregate chunk success as equivalent coverage to one full suite run
  when a monolithic run would exhaust the devcontainer.

## Workflow

1. Build the phase list:
   - User supplied paths: use those spec files.
   - User supplied chunk id: use the matching chunk command.
   - No paths: run the selected suite with the npm script and collect failing
     chunk ids and spec files from Playwright output. If a full run was
     explicitly requested and memory is safe, still use the npm script because
     it is chunked by default.
2. Pick one failing spec file.
3. Re-run the failing chunk when the failure is not yet isolated:
   - Dev: `npm run test:integration -- --chunk <chunk-id>`
   - Prodlike: `npm run test:integration:prodlike -- --chunk <chunk-id>`
4. Re-run only a specific failing spec with the matching spec phase command
   once the failure is isolated.
5. Inspect Playwright output, traces, screenshots, console errors, app-server
   logs printed by the chunk runner, and memory snapshots.
6. Fix the smallest spec defect that explains the failure.
7. Re-run the same chunk or spec until it passes.
8. Repeat steps 3-7 for each failing chunk or spec file.
9. Run the selected suite after all known phases pass, using memory-safe chunks
   when a monolithic full suite risks devcontainer exhaustion.
10. If new spec files fail, repeat from step 2.
11. If dev and prodlike are both in scope, finish dev before starting prodlike.

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
