_This file is auto-applied to every Copilot interaction in this
repository._

# Copilot Instructions — `viscalyx/developer-mode`

A small TypeScript library monorepo that publishes
`@viscalyx/developer-mode-core` and `@viscalyx/developer-mode-react`.

## Stack

- TypeScript (strict)
- **ESM-only** — both packages are `"type": "module"`, no CJS output
- Node ≥ 22 (see `.nvmrc`)
- React 19 (peer dep of `@viscalyx/developer-mode-react` only)
- Vitest + happy-dom + Testing Library
- [Biome](https://biomejs.dev/) for lint + format
- [tsdown](https://tsdown.dev/) for build (one config per package)
- npm workspaces
- [Changesets](https://github.com/changesets/changesets) for versioning

## Layout

```text
packages/
├── developer-mode-core/    # framework-agnostic helpers, marker fns
└── developer-mode-react/   # React 19 provider + overlay (peer-dep)
```

Each package ships:

- A main `.` export.
- A `./noop` subpath that is API-compatible with the main entry but
  does nothing — used for SSR-disabled or feature-flag-off builds.

See `.github/instructions/monorepo-structure.instructions.md` for
the full layout rules.

## Commands (run from the repo root)

| Task               | Command            |
|--------------------|--------------------|
| Install            | `npm install`      |
| Build all packages | `npm run build`    |
| Type-check         | `npm run type-check` |
| Run tests          | `npm run test`     |
| Lint               | `npm run lint`     |
| Markdown lint      | `npm run lint:md`  |
| Composite check    | `npm run check`    |
| Add a changeset    | `npx changeset`    |

## General rules

- **Every PR that changes published files** (`packages/*/src/**` or
  `packages/*/package.json` fields that ship) MUST include a
  changeset. CI enforces this. See
  `.github/instructions/release.instructions.md`.
- **Never edit `CHANGELOG.md` or any package `version` field by
  hand.** Changesets owns both.
- **Packages are ESM-only.** Do not add CJS output, `require()`
  entry points, or a `"main"` field pointing at `.cjs`. If a CJS
  consumer ever needs to be supported, that is a deliberate
  decision recorded in `RELEASING.md`, not an ad-hoc change. See
  `.github/instructions/package-exports.instructions.md`.
- **When you change the public API** of a package (anything
  exported from `src/index.*` or a subpath), update that package's
  `README.md` in the same PR.
- **When you add or change a workflow** under `.github/workflows/`,
  update `docs/workflows.md`.
- **Cross-cutting AI authoring rules** live in
  `.github/instructions/ai-instruction-authoring.instructions.md`.
  Read it before editing or adding any instruction file.
- **Skills** live in `.github/skills/`. When working in Codex,
  install them locally via the `sync-codex-skills` skill.

## Pointers

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — local setup and PR flow.
- [`RELEASING.md`](../RELEASING.md) — release flow and the ESM-only
  policy.
- [`docs/architecture.md`](../docs/architecture.md) — how the two
  packages relate.
- [`docs/workflows.md`](../docs/workflows.md) — what each CI
  workflow does.
- `.github/instructions/*.md` — area-specific rules; consult before
  editing matching files.
