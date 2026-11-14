---
applyTo: 'scripts/**/*.js,scripts/**/*.mjs'
---

# Scripts

## Coverage and Tests

- Treat deterministic script logic as production code and keep changed files at `>= 85%` coverage (`lines`, `statements`, `functions`, `branches`).
- Add or update Vitest tests when editing scripts that parse, transform, or generate data.
- Prefer extracting pure functions from CLI wrappers so behavior is easy to test.
- For mixed scripts, extract pure logic into helper functions/modules and cover that code to `>= 85%`.
- For database scripts, follow
  `docs/development/sql-server-developer-workflow.md` and
  `database-schema.instructions.md` for schema, seed ownership and upgrades.
- For database command results and runtime identity verification, follow
  `database-operations.instructions.md`.

## What to Exclude from Coverage

- Orchestration-only scripts that mostly coordinate subprocess calls or environment setup
