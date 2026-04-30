---
applyTo: '{packages/**,tsconfig.base.json,tsconfig.json,biome.json,package.json,vitest.config.ts}'
---

# Monorepo Structure (AI-only instruction)

This repository is an **npm workspaces** monorepo for the
`@viscalyx/developer-mode-*` packages.

## Layout

```text
.
├── package.json              # root, private, defines workspaces
├── tsconfig.base.json        # shared TS compiler options
├── tsconfig.json             # solution file with project references
├── biome.json                # shared lint/format config (all packages)
├── vitest.config.ts          # shared test runner config
├── packages/
│   ├── developer-mode-core/  # framework-agnostic
│   │   ├── package.json
│   │   ├── tsconfig.json     # extends ../../tsconfig.base.json
│   │   ├── tsdown.config.ts
│   │   ├── src/
│   │   ├── tests/
│   │   └── README.md
│   └── developer-mode-react/ # React 19 wrapper, peer-dep on react
│       └── …
└── .changeset/               # changesets for both packages
```

## Where shared config lives

- **TypeScript**: `tsconfig.base.json` at the root holds the strict
  compiler options. Each package's `tsconfig.json` `extends` it and
  only sets `rootDir`, `outDir`, `composite`, references, and
  `include`. The root `tsconfig.json` is a solution file with
  project references — `tsc -b` from the root builds everything.
- **Biome**: a single `biome.json` at the root applies to every
  package. There are no per-package `biome.json` overrides.
- **Vitest**: a single `vitest.config.ts` at the root with the glob
  `packages/*/tests/**/*.{test,spec}.{ts,tsx}`. There are no
  per-package Vitest configs.
- **Build**: each package owns its `tsdown.config.ts` because
  entry points and externals differ. The root `npm run build`
  delegates via `npm run build --workspaces --if-present`.

## Adding a new package

1. Create `packages/<new-package>/` with `package.json`,
   `tsconfig.json`, `tsdown.config.ts`, `src/`, `tests/`,
   `README.md`.
2. Use the existing packages as templates — copy their `package.json`
   shape (ESM-only `exports`, `engines`, `publishConfig`, `repository`
   `directory`).
3. Initial `version` is `0.1.0`. Initial publish goes via Changesets
   (add a `minor` changeset describing the new package).
4. Add a project reference in the root `tsconfig.json`.
5. If the new package depends on another workspace package,
   reference it by published semver range (`^0.1.0`), not a
   `workspace:` protocol — npm hoists the local copy at install time.
6. If the new package has runtime side effects, ship a `./noop`
   subpath (see `package-exports.instructions.md`).
7. Update the root `README.md` "Packages" table and
   `docs/architecture.md`.

## Build / lint / test commands

All commands run from the repo root. Per-package commands are
available via `npm run <script> --workspace @viscalyx/<name>`.

| Task               | Command            |
|--------------------|--------------------|
| Install            | `npm install`      |
| Type-check         | `npm run type-check` |
| Build all packages | `npm run build`    |
| Run all tests      | `npm run test`     |
| Lint               | `npm run lint`     |
| Format             | `npm run format`   |
| Markdown lint      | `npm run lint:md`  |
| Composite check    | `npm run check`    |
