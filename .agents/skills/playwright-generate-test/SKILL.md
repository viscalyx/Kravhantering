---
name: playwright-generate-test
description: >-
  Generate a Playwright test from a supplied scenario using Playwright MCP. Use
  when a user asks to turn a testing scenario into runnable test code,
  selectors, and assertions.
---

# Test Generation with Playwright MCP

Generate a Playwright test after completing the prescribed Playwright MCP steps
for the supplied scenario.

## Specific Instructions

- Require a concrete manual user journey before generating an integration test.
- Call the Skill tool with "maintain-manual-tests" to choose the suite and
  synchronize the journey with its manual case.
- Do not emit test code before finishing the prescribed Playwright MCP workflow.
- Run the workflow step by step with the Playwright MCP tools.
- After all steps complete, emit a Playwright TypeScript test using
  `@playwright/test` and the recorded message history.
- Choose viewport variants that protect distinct behavior in the scenario.
- Set each selected viewport explicitly and record its message history.
- Save the generated test file under `tests/`.
- For `tests/integration`, maintain the corresponding case in
  `docs/governance/manuella-testfall.md` and include its ID in the test title.
- Populate the test and manual case from the same scenario, message history,
  selectors and runtime observations; keep their actions and outcomes aligned.
- Execute the generated test file and iterate until it passes.
