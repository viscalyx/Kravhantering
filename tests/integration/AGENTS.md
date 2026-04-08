# Integration Test Instructions

## Keep Docs In Sync

- Check for a co-located `.md` companion after editing an integration test.
- Keep helper descriptions aligned with the current implementation.
- Keep sequence diagrams and flowcharts aligned with current test steps.
- Keep constants, imports, and tool descriptions accurate.
- Document new behavior and changed assertions.
- Never leave documentation describing stale behavior.

## Document New Tests

- Create a co-located `.md` companion for each new integration test.
- Follow the template in
  [`.github/prompts/generate-test-docs.prompt.md`](../../.github/prompts/generate-test-docs.prompt.md).
- Use [`requirements-table-resize.md`](requirements-table-resize.md) as the
  current reference example.
- Include the global title and introduction, an overview Mermaid flowchart,
  and test setup documentation.
- For each test case, add an explicit section with a clear purpose, a numbered
  step-by-step flow, a Mermaid sequence diagram, and an optional supplementary
  Mermaid flowchart when branches or state transitions need clarification.

## Playwright Style

- Use auto-retrying web-first assertions (`await expect(locator).toHaveText()`,
  `.toContainText()`, `.toHaveURL()`, `.toHaveCount()`). Avoid `.toBeVisible()`
  unless explicitly testing a visibility change.
- Never use `page.waitForTimeout()` or increase default timeouts. Rely on
  Playwright auto-waiting.
- Use `test.step()` to group related interactions within a test.

## General Rules

- Follow
  [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md).
- Follow
  [`.github/instructions/markdown-linting.instructions.md`](../../.github/instructions/markdown-linting.instructions.md).
- Run `npm run check` before finishing changes to integration tests or
  their companion docs.
