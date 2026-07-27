# Dependency Workflow

This document covers npm dependency installation and recovery workflows.

## Toolchain and Lifecycle Policy

Root `package.json` is canonical for the exact reviewed npm version. The
devcontainers, CI jobs, production Dockerfiles, nested HSA packages, and Azure
bootstrap install that same version before running repository installs.
GitHub Actions disables setup-node's automatic npm cache discovery until the
canonical npm version is active, then restores the npm cache in a second step.

Every npm project enables `strict-allow-scripts` in its project `.npmrc`.
`allowScripts` in the matching `package.json` records version-pinned approvals
and explicit denials. Review pending scripts with:

```sh
npm approve-scripts --allow-scripts-pending
npm --prefix containers/hsa-directory-mock approve-scripts --allow-scripts-pending
npm --prefix containers/hsa-person-lookup-adapter approve-scripts --allow-scripts-pending
```

Do not approve all scripts. A new unreviewed lifecycle script fails a clean
install and the normal dependency-maintenance quality gate.

## Normal Install

Bootstrap the repository npm version after cloning or when the canonical npm
version changes:

```sh
node scripts/install-repository-npm.mjs
```

For everyday local development and intentional dependency updates, run:

```sh
npm install
```

Alternatively, for a clean, lockfile-exact install such as CI or disposable
local validation, run:

```sh
npm ci
```

Do not run both install alternatives sequentially.

## Purge Install

Use `npm run purge:install` when `node_modules` or `package-lock.json` appears
corrupt, after difficult dependency updates, or when Codespaces reports failed
dependency installation.

The script uses a two-phase install:

1. Delete `node_modules`, clean cache, run `npm install`. This rebuilds the
   dependency tree but may produce a corrupt lockfile.
2. Delete `package-lock.json`, run `npm install` again. This regenerates a clean
   lockfile with `node_modules` present.

<!-- cSpell:ignore EBADPLATFORM -->

This works around an npm bug where platform-specific optional dependencies are
written to the lockfile as `"extraneous"` instead of `"optional"` when
`node_modules` is absent during resolution. A corrupt lockfile causes `npm ci`
in CI to fail with `EBADPLATFORM`.

Do not simplify `purge:install` into a single command such as
`rm -rf node_modules package-lock.json && npm install`; that reproduces the
bug.

## Package Maintenance

For package upgrades, overrides, and vulnerability-related dependency work,
follow the repository package-update instructions and keep changes scoped:

- [.github/instructions/package-updates.instructions.md](../../.github/instructions/package-updates.instructions.md)
- [.github/instructions/node-version.instructions.md](../../.github/instructions/node-version.instructions.md)

`.github/dependency-maintenance.json` routes each active package and image
input to either native Dependabot or a detector-created issue. Run its
discovery and policy invariant after changing package, image, CI, or install
surfaces:

```sh
npm run dependency-maintenance:check
```

Native npm Dependabot lanes update one dependency per pull request. Coordinated
npm toolchain and production image drift creates issues labeled
`automation:dependency-drift`, `dependencies`, and `ready-for-agent`.

Run the relevant checks after dependency changes. At minimum, run:

```sh
npm run check
```
