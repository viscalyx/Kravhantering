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
npm toolchain, Lychee toolchain, devcontainer base image, and production image
drift creates issues labeled `automation:dependency-drift`, `dependencies`,
and `ready-for-agent`.

The scheduled Lychee detector reads the aligned version and AMD64 and ARM64
asset checksums from the devcontainer, Azure bootstrap, and quality workflow.
It compares that state with the latest supported stable GitHub release and its
published asset digests. A generated issue lists every synchronized surface
and requires both installer versions, the workflow `lycheeVersion`, and both
architecture checksums to be updated together. The Lychee action remains
commit-SHA pinned and continues through the GitHub Actions Dependabot lane.

## Development Service Image References

The image locks under `containers/` are canonical for both the reviewed tag and
the recorded manifest and image identities. Supported devcontainer compose
files and Azure development Quadlets repeat only the canonical tag for SQL
Server, Keycloak, and Kong. They do not append a manifest digest to the runtime
reference. Production, release-smoke, and operator-controlled references keep
their separate immutable identity policy.

The dependency-maintenance check derives the expected development tag from the
matching lock instead of storing a version in the test. A coordinated image
update changes the lock and every supported development reference in one
change. Same-tag digest drift remains reportable; review the upstream change
before updating the evidence recorded in the lock.

The non-`latest`, tag-only rule applies only to locks that feed supported
devcontainer or personal Azure development references. Production-only locks
and runtime references retain their separate release and operator policies.
The devcontainer base image follows the same development rule. Its Dockerfile
uses the exact semantic version tag recorded in
`containers/devcontainer-base/image.lock.json` without appending a digest. The
scheduled detector compares that lock with upstream so a newer exact tag or a
new digest under the current tag creates a coordinated drift issue. Tests derive
the expected Dockerfile reference from the lock rather than storing its version.

The HSA support Dockerfiles are shared by development and release builds. Their
Node base references retain the production tag-and-digest identity in both
contexts so local HSA support uses the same build inputs as release artifacts.
The Node drift detector requires the app and both HSA Dockerfiles to use one
coordinated identity.

## Rolling Development Tool Integrity

Development tools remain rolling. A rebuild resolves current upstream state;
routine tool versions and Git commit IDs are not committed to the repository.
The installation channel determines the integrity check:

- Codex and dotenv-linter require the SHA-256 digest published for the selected
  GitHub release asset before any downloaded code runs.
- NodeSource, Docker, GitHub CLI, and Tailscale repository keys must match the
  reviewed primary fingerprints in the Azure bootstrap. APT then verifies
  signed repository metadata and package hashes while package versions roll.
- npm registry SRI and OCI manifest digests provide content integrity for the
  rolling Copilot CLI and Dev Container Features.
- Azure resolves each rolling Oh My Zsh, plugin, and theme branch to an exact
  Git object during setup and verifies the checkout. ADR 0045 records the
  explicit publisher-authenticity exception for these sources and for matching
  feature-managed devcontainer clones.

Do not execute a network response directly as shell code. When a signing key
rotates, review the new primary fingerprint and update the bootstrap and its
tests deliberately. A normal tool release must not require a test-value update.

Run the relevant checks after dependency changes. At minimum, run:

```sh
npm run check
```
