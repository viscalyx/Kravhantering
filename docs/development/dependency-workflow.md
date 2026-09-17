# Dependency Workflow

This guide is for developers installing or recovering dependencies and
maintainers updating npm packages, toolchains, and container inputs. Run the
commands from the repository root unless a command specifies a package prefix.

## Toolchain and Lifecycle Policy

Root `package.json` is canonical for the exact reviewed npm version. The
devcontainers, CI jobs, production Dockerfiles, nested HSA packages, and Azure
bootstrap install that same version before running repository installs.

Every npm project enables `strict-allow-scripts` in its project `.npmrc`.
`allowScripts` in the matching `package.json` records version-pinned approvals
and explicit denials. Review pending scripts with:

```sh
npm approve-scripts --allow-scripts-pending
npm --prefix containers/hsa-directory-mock approve-scripts --allow-scripts-pending
npm --prefix containers/hsa-person-lookup-adapter approve-scripts --allow-scripts-pending
npm --prefix containers/hsa-mtls-provisioner approve-scripts --allow-scripts-pending
```

Do not approve all scripts. A new unreviewed lifecycle script fails a clean
install where scripts are enabled and the normal dependency-maintenance quality
gate. After reviewing a script, record `"package@exact-version": true` or an
explicit denial in that project's `allowScripts`, then retry the install. An
approval for an older version does not approve a new version. The HSA mTLS
provisioner also sets `ignore-scripts=true`; keep that setting when updating its
dependencies.

## Normal Install

Use the Node major declared in `.nvmrc` and `package.json` (currently Node 24).
With nvm, run `nvm install` and `nvm use` first. Bootstrap the repository npm
version after cloning or when the canonical npm version changes:

```sh
node scripts/install-repository-npm.mjs
```

The bootstrap installs npm globally in the active Node installation and verifies
the selected version. That installation's global npm prefix must be writable.

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

Review and commit `package.json` and `package-lock.json` changes together for
intentional updates. Nested HSA projects have their own manifests and lockfiles;
install in the affected project with `npm --prefix <project-directory> install`.

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

This recovery regenerates the root lockfile and can change resolved versions
within the declared ranges. Review its diff and run the dependency checks below
before committing it.

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

### Dependency Drift Issue Lifecycle

Each actionable available target has its own Dependency Drift issue. A new
version or changed image digest can replace an earlier issue for the same
maintenance unit. Use the current issue's target and linked replacement when
planning an update.

The workflow runs weekly and can be started manually from the **Dependency
Drift** Actions workflow on `main`, for all units or one selected unit. It
comments when the repository's current state changes, closes superseded issues
as not planned, and closes resolved issues as completed. Manually closing
unresolved drift does not suppress detection; the next scan creates a fresh
issue.

The dependency-maintenance deferral registry is the only supported suppression
mechanism. An active reviewed deferral that matches the available version or tag
adds the rationale, expiry, and target to a comment before closing the active
issue as not planned. If drift remains after the deferral expires, the workflow
creates a fresh issue instead of reopening the deferred issue.

Record a reviewed deferral in the `deferrals` array in
`.github/dependency-maintenance.json` with `unit` (the registry unit ID),
`available` (the exact available version or tag), `rationale`, and `expiresOn`
(`YYYY-MM-DD`). Matching uses the version or tag, so an image deferral also
covers digest changes under that tag. Run `npm run dependency-maintenance:check`
after editing the registry; expired entries fail that check and must be removed
or reviewed again.

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

A coordinated image update changes the lock and every supported development
reference in one change. Same-tag digest drift remains reportable; review the
upstream change before updating the evidence recorded in the lock.

The non-`latest`, tag-only rule applies only to locks that feed supported
devcontainer or personal Azure development references. Production-only locks
and runtime references retain their separate release and operator policies.
The devcontainer base image follows the same development rule. Its Dockerfile
uses the exact semantic version tag recorded in
`containers/devcontainer-base/image.lock.json` without appending a digest. The
scheduled detector compares that lock with upstream so a newer exact tag or a
new digest under the current tag creates a coordinated drift issue.

The HSA support Dockerfiles are shared by development and release builds. Their
Node base references retain the production tag-and-digest identity in both
contexts so local HSA support uses the same build inputs as release artifacts.
The Node drift detector discovers direct references and ARG defaults and
requires every remaining Docker Official Node input, including the HSA topology
helper, to use one coordinated immutable identity. New image inputs must be
registered under exactly one maintenance role.

## UBI Node Builder and Runtime Maintenance

The `ubi-node-builder` and `ubi-node-runtime` units independently select public
UBI 10 Node.js 24 inputs. Each unit's `selectedReference` in
`.github/dependency-maintenance.json` is its immutable build selection.

Update only the role named by the drift issue. Update its `selectedReference`
and every discovered direct `FROM` reference and image ARG default together.
The coverage check rejects ambiguous ownership, unresolved ARG references,
and a role reference that differs from its selected digest. Keep remaining
Docker Official Node and vendor image lanes registered, including the HSA
topology helper. UBI inputs do not use the vendor `image.lock.json` format.

The weekly Dependency Drift workflow and its manual unit choices query
`registry.access.redhat.com` anonymously. Numeric UBI 10 version/revision tags
advance within the selected Node 24 repository; source tags and other major
versions are excluded. A selected `latest` channel stays on that channel and
reports changed digests. Every selected reference includes a SHA-256 digest;
`latest` alone is never a build or deployment identity. When the registry
publishes an index, the selected digest identifies that index.

Use the
[resolve-dependency-drift skill](../../.github/skills/resolve-dependency-drift/SKILL.md)
for reviewed updates. Verify the exact replacement input through existing
image and release checks, then deliver a new immutable project release through
the normal publishing path. Installed releases do not follow moving base tags.
The requirement is no-cost anonymous Node 24 update eligibility through at least
April 2028; current anonymous access does not guarantee future availability.

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

## Validate Dependency Changes

Run the relevant checks after dependency changes. At minimum, run:

```sh
npm run check
npm audit
```

Run `npm --prefix <project-directory> audit` for each changed nested npm
project. After updating `@playwright/test`, run `npx playwright install chromium`
after the install so integration tests use the matching browser binary.
