---
applyTo: '{package.json,packages/*/package.json}'
---

# Package Management Rules

Applies to the root `package.json` and to every workspace package
under `packages/*`.

## Version Specifiers

- If a dependency is already pinned (no `^` or `~`), treat that as
  intentional — do not change it to a range or another version
  without confirming.
- Do not normalize existing valid ranges (`^`/`~`) to pinned
  versions unless explicitly requested.
- The `overrides` section may pin transitive dependencies — check
  for needed updates when direct dependencies change.

## Compatibility

- React, `react-dom`, and `@types/react`/`@types/react-dom` MUST
  share the same major version.
- Keep `@biomejs/biome` and the `biome.json` `$schema` version
  aligned when upgrading Biome.
- The `engines.node` field in every package MUST be compatible
  with the value in `.nvmrc`.

## Workspace Dependencies

- Workspace packages depend on each other by their published
  semver range (e.g. `"@viscalyx/developer-mode-core": "^0.1.0"`),
  not the pnpm/yarn `workspace:` protocol — npm workspaces hoist
  the local copy at install time.
- When you bump a package whose API another workspace package
  consumes, also widen / bump that dependent's range and add a
  changeset for **both** packages.

## After Any Dependency Change

- Run `npm install` so the lockfile updates.
- Run `npm run check` to verify type-checking, formatting, linting,
  tests, markdown checks, and build all pass.
- Run `npm audit` to verify vulnerability checks pass.
- Add a changeset if the change affects published files (see
  `release.instructions.md`).
