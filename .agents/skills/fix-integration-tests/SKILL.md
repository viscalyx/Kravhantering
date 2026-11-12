---
name: fix-integration-tests
description: >-
  Run and repair Playwright integration tests in focused phases with test-only
  edits. Use when asked to run, triage, or fix
  `npm run test:integration`, `npm run test:integration:prodlike`, or
  specific `tests/integration/**/*.spec.ts` failures.
---

# Fix Integration Tests

## Scope

- Call the Skill tool with "maintain-manual-tests" when changing coverage or
  moving technical checks between suites. Keep integration scenarios as user
  journeys; place standalone technical checks in the appropriate unit,
  browser or tooling suite.
- Edit failing specs and the shared helpers they use under `tests/support/`.
  Keep helper changes limited to test setup, assertions or measurements.
  Preserve production contracts and assertions.
- Do not run a full suite while fixing a phase.
- Do not abort or restart a slow test only because it exceeds an arbitrary
  duration. Stop when the user changes the requested scope, the runner is
  stuck, or memory pressure risks killing the devcontainer.

## Project Setup

- Read `package.json`, the Playwright configuration and test-environment scripts
  to identify suites, preparation and commands for a suite or selected case.
  Run builds and tests through repository npm scripts and supported arguments.
- Chunks: only when project scripts, runner configuration, or testing docs
  define integration-test chunks, read [CHUNKS.md](CHUNKS.md) before building
  the phase list. Otherwise, use the suite and spec workflow below.
- Complete dependency and browser preparation required by those scripts before
  running tests. Preserve existing data and configuration.

## Workflow

1. Call the Skill tool with "select-integration-tests", supplying user-provided
   paths, reported failures and the current change. Group its selected
   scenarios by spec file into phases; execute its required runs to collect
   failures.
2. Pick one failing spec file.
3. Inspect existing failure evidence. For an intermittent failure, follow
   [intermittent investigation](references/intermittent-failures.md)
   before another run replaces artifacts: preserve the original execution,
   separate facts from hypotheses, and set a bounded reproduction plan.
4. Inspect Playwright output, traces, screenshots, console errors, app-server
   logs, and available memory diagnostics.
5. Fix the smallest established test defect. Repair a shared helper once
   instead of copying a corrected implementation into a spec. If the cause
   remains unknown at the experiment limit, retain an unresolved record with
   the attempted experiments and specific next step; continue other phases.
6. Call the Skill tool with "select-integration-tests" after the fix;
   execute its required runs.
7. Repeat steps 3-6 for each failing spec file.
8. Supply results to "select-integration-tests" to assess completion and
   prepare verification reporting. Return to step 2 for remaining failures
   that can be repaired within this skill's scope.
9. If dev and prodlike are both in scope, finish dev before starting prodlike.

## Fix Rules

- Prefer current product behavior and repository docs over stale test
  expectations.
- Do not weaken assertions, add arbitrary waits, or skip tests to hide
  failures.
- Use Playwright locator, navigation, and state waits instead of fixed
  timeouts.
- Treat env-only failures as setup issues before changing spec code.
- Report execution verification separately from cause disposition. An unchanged
  pass preserves the original intermittent failure and unresolved follow-up.
- Keep billable provider calls subject to explicit user authorization;
  credentials and opt-in configuration do not authorize execution.
- Do not edit production code, including application, component, hook, runtime
  library, translation, config, migration, or seed files.
- If a production change is required, report
  `PRODUCTION CHANGE NEEDED: {link to report}`.
  - Write a detailed report in the system's temporary folder explaining what
    needs to change and why.
  - Group the report by failing spec file.
  - For each spec group, include the command, failure evidence, suspected
    production files or symbols, required behavior change, and blocked tests.
- Continue with remaining test-only phases after writing the report.
- Respect Playwright config differences between dev and prodlike runs.
