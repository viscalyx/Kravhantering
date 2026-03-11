# AGENTS.md — Integration Tests

Instructions for AI coding agents working in `tests/integration/`.

## Keep Documentation in Sync

Integration test files may have a co-located `.md` companion that documents the test flow with Mermaid diagrams and step-by-step descriptions.

**After modifying a test file**, check whether a companion `.md` exists in the same directory. If it does, verify that:

- Helper function descriptions still match the implementation.
- Sequence diagrams and flowcharts reflect the current test steps.
- Constants, imports, and tool descriptions are accurate.
- Any new behavior or changed assertions are documented.

**Never leave docs describing stale behavior.**

## Creating Documentation for New Tests

When adding a **new** integration test file, generate a companion `.md` following the prompt at [`.github/prompts/generate-test-docs.prompt.md`](../../.github/prompts/generate-test-docs.prompt.md). That prompt defines the required structure:

- Title and introduction
- Overview flowchart (Mermaid)
- Test setup documentation
- Per-test-case sections with purpose, step-by-step flow, sequence diagram, and optional supplementary flowchart

See [`cookie-consent.md`](cookie-consent.md) for a complete reference example.

## General Rules

- Follow project conventions in [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) and markdown conventions in [`.github/instructions/markdown-linting.instructions.md`](../../.github/instructions/markdown-linting.instructions.md).
- Run `npm run check` (lint, test, type-check, format, spell) to validate changes before finishing.
