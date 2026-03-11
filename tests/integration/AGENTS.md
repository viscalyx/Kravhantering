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
- Follow
  [`.github/prompts/generate-test-docs.prompt.md`](../../.github/prompts/generate-test-docs.prompt.md).
- Include a title, introduction, overview mermaid flowchart, test setup, and
  per-test sections.
- Use [`requirements-table-resize.md`](requirements-table-resize.md) as
  the current reference example.

## General Rules

- Follow
  [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md).
- Follow
  [`.github/instructions/markdown-linting.instructions.md`](../../.github/instructions/markdown-linting.instructions.md).
- Run `npm run check` before finishing changes to integration tests or
  their companion docs.
