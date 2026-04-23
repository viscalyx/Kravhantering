---
applyTo: 'scripts/**/*.js,scripts/**/*.mjs'
---

# Scripts

## Coverage and Tests

- Treat deterministic script logic as production code and keep changed files at `>= 85%` coverage (`lines`, `statements`, `functions`, `branches`).
- Add or update Vitest tests when editing scripts that parse, transform, or generate data.
- Prefer extracting pure functions from CLI wrappers so behavior is easy to test.
- For mixed scripts, extract pure logic into helper functions/modules and cover that code to `>= 85%`.
- For database scripts, follow `docs/sql-server-developer-workflow.md`. Schema lives in TypeORM entities under `lib/typeorm/entities/`, migrations in `typeorm/migrations/`, and seed data in `typeorm/seed.mjs`. Preserve seed-data meaning unless a documented exception is necessary.

## What to Exclude from Coverage

- Orchestration-only scripts that mostly coordinate subprocess calls or environment setup
