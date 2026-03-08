---
applyTo: 'package.json'
---

# Package Management Rules

## Version Specifiers

- If a dependency is already pinned (no `^` or `~`), treat that as intentional — do not change it to a range or another version without confirming
- Do not normalize existing valid ranges (`^`/`~`) to pinned versions unless explicitly requested
- The `overrides` section may pin transitive dependencies — check for needed updates when direct dependencies change

## Compatibility

- Next.js and React share tight peer dependency requirements — always verify compatibility before updating either
- Keep `@biomejs/biome` and the `biome.json` `$schema` version aligned when upgrading Biome
- `@types/react` and `@types/react-dom` should match the installed React major version

## After Any Dependency Change

Run `npm run check` to verify type-checking, formatting, linting, tests, and security audit all pass.
