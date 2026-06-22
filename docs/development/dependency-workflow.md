# Dependency Workflow

This document covers npm dependency installation and recovery workflows.

## Normal Install

Use the normal npm commands unless dependency state is visibly broken:

```sh
npm install
npm ci
```

Use `npm install` during everyday local development and after intentional
dependency updates. Use `npm ci` for clean, lockfile-exact installs such as CI
or disposable local validation.

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

Run the relevant checks after dependency changes. At minimum, run:

```sh
npm run check
```
