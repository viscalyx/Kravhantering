---
name: playwright-generate-test
description: 'Generate a Playwright test based on a scenario using Playwright MCP'
---

## Test Generation with Playwright MCP

Generate a Playwright test from the provided scenario only after completing the prescribed Playwright MCP steps.

### Specific Instructions

- Require a concrete scenario before generating code.
- Do not emit test code before finishing the prescribed Playwright MCP workflow.
- Run the workflow step by step with the Playwright MCP tools.
- Only after all steps are complete, emit a Playwright TypeScript test that uses `@playwright/test` and the recorded message history.
- Cover both mobile (`375px` wide) and desktop (`1280px` wide)
  viewports.
- Explicitly set each viewport in the generated Playwright TypeScript
  test, either as two runs or as a parametrized test, and record message
  history for each viewport.
- Save the generated test file under `tests/`.
- If the target path is under `tests/integration`, also generate a co-located companion `.md` file using `.github/prompts/generate-test-docs.prompt.md`.
- Populate the test and companion doc from the same scenario, message history, selectors, and runtime observations, and keep them synchronized as the test evolves.
- Execute the generated test file and iterate until it passes.
