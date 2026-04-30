# Contributing

Thanks for your interest in `@viscalyx/developer-mode`!

This guide covers local setup, the dev loop, and what's expected
of a PR. For release mechanics see [`RELEASING.md`](./RELEASING.md).
For project-wide AI-authoring rules consult
[`.github/copilot-instructions.md`](./.github/copilot-instructions.md)
and the matching `.github/instructions/*.md` files.

## Prerequisites

- Node matching `.nvmrc` (currently Node 22 LTS or newer). Use
  `nvm install && nvm use` to pick the right version automatically.
- npm 10+ (ships with Node 22).

## Setup

```bash
git clone https://github.com/viscalyx/developer-mode.git
cd developer-mode
nvm install            # honours .nvmrc
npm install
npm run check
```

`npm run check` runs the full local quality bar: type-check,
formatter check, linter, markdown lint, build, and tests.

## Day-to-day commands

| Task                          | Command                |
|-------------------------------|------------------------|
| Type-check everything         | `npm run type-check`   |
| Build all packages            | `npm run build`        |
| Run tests once                | `npm run test`         |
| Tests in watch mode           | `npm run test:watch`   |
| Lint                          | `npm run lint`         |
| Auto-fix lint where possible  | `npm run lint:fix`     |
| Format check                  | `npm run format:check` |
| Format write                  | `npm run format`       |
| Markdown lint                 | `npm run lint:md`      |

To run a script for a single workspace:

```bash
npm run test --workspace @viscalyx/developer-mode-core
npm run build --workspace @viscalyx/developer-mode-react
```

## Repository layout

```text
packages/
├── developer-mode-core/    # framework-agnostic, no React
└── developer-mode-react/   # React 19 wrapper, peer-dep on react
```

See [`docs/architecture.md`](./docs/architecture.md) for the full
picture and
[`.github/instructions/monorepo-structure.instructions.md`](./.github/instructions/monorepo-structure.instructions.md)
for the structural rules.

## Submitting a PR

1. Branch from `main` (`feat/...`, `fix/...`, `chore/...`).
2. Make your change. Keep it focused — small PRs land faster.
3. Update the package `README.md` if you changed the public API.
4. Update `docs/workflows.md` if you changed a workflow.
5. **Add a changeset** (`npx changeset`) for any change that
   touches `packages/*/src/**` or a published `package.json` field.
   Repo-tooling-only PRs do not need a changeset and CI will pass
   without one. See
   [`.github/instructions/release.instructions.md`](./.github/instructions/release.instructions.md)
   for how to choose the bump.
6. Run `npm run check` locally — CI runs the same set.
7. Open the PR. The PR template walks you through the final
   checklist.

### Hard rules

- **ESM-only.** Do not add CJS output, a `"main"` field pointing
  at `.cjs`, or any `"require"` condition in an `exports` map. See
  [`.github/instructions/package-exports.instructions.md`](./.github/instructions/package-exports.instructions.md).
- **Never edit `CHANGELOG.md` or any package `version` by hand.**
  Changesets owns both.
- **Public API changes need a `README.md` update** in the affected
  package, in the same PR.

## Reporting issues

Use the bug-report or feature-request templates in
`.github/ISSUE_TEMPLATE/`. For security reports, see
[`SECURITY.md`](./SECURITY.md).

## Code of conduct

By participating you agree to abide by
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
