# Trusted Container Publishing

The trusted container flow runs from `.github/workflows/container-release.yml`
for `main`, stable `vX.Y.Z` tags, and manual workflow runs. Preview release
tags such as `vX.Y.Z-preview.N` are created by the `main` run and are excluded
from the tag trigger so the preview tag push does not start a second container
release workflow.

The workflow builds `app-runtime` and `db-job`, publishes them to GHCR, and
records two image identities in `container-stack.lock.json`. The
`manifestDigest` is the registry manifest digest used for GitHub Artifact
Attestations, SBOM subjects and GHCR release smoke tests. The `imageId` is the
container image ID used by production operators to verify runtime equivalence
after tag-based pulls, internal-registry mirroring or disconnected image
transport.
The release smoke test starts Podman Compose from verified GHCR manifest digest
references, but production deployment and upgrade guides use tag-style runtime
refs and verify them against locked image IDs.

The Buildx publish steps disable BuildKit's default registry provenance
attestations with `--provenance=false`. The workflow publishes provenance and
SBOM evidence explicitly through GitHub Artifact Attestations without pushing
the attestation OCI artifacts back into GHCR. This keeps GitHub Packages from
treating digest-derived attestation tags as the newest installable package
version while keeping the Buildx metadata shape stable enough to record both
`manifestDigest` and `imageId`.

## Reproducibility

The workflow uses the Node version from `.nvmrc` and installs dependencies with
`npm ci` using the npm bundled with that pinned runtime. Do not add
`npm install -g npm@latest` to this workflow. If npm must be upgraded
explicitly, pin the exact npm version and document the reason here.

Stable and preview releases use the semantic version as the primary
`app-runtime` and `db-job` image tag recorded in `container-stack.lock.json`.
Preview releases also publish `main-<short-sha>` and `sha-<full-sha>` image
tag aliases for commit traceability. Preview releases use GitVersion's
`FullSemVer` or `SemVer` value, but Docker image tags and GitHub preview tag
names strip SemVer build metadata from the first `+` onward. For example,
`1.2.0-preview.4+Branch.main.Sha.abcdef` becomes `1.2.0-preview.4`.

Local and release-smoke stack startup honor `--lock-file`. When the stack builds
local images, `run-local-stack.mjs` passes that path to
`generate-stack-lock.mjs` before `generate-compose.mjs` reads it.

## Vendor Image Lock Updates

`.github/workflows/vendor-image-updates.yml` checks nginx, SQL Server and
Keycloak upstream tags weekly from `main` and can also be run manually with
`workflow_dispatch`. Manual runs may select `all`, `nginx`, `sqlserver` or
`keycloak`; the `include-current` input also refreshes the immutable digest
metadata for the current selected lane.

The updater uses one branch and one ready-for-review PR per image lane. A lane
is the image name plus the target major line, or the SQL Server product year:

- `automation/vendor-image/keycloak-26`
- `automation/vendor-image/keycloak-27`
- `automation/vendor-image/nginx-1`
- `automation/vendor-image/sqlserver-2025`

Within a lane, newer patch and minor releases update the existing PR instead
of opening another PR. For example, a Keycloak `26.7.1` release updates the
open `keycloak-26` PR, while a later `27.0.0` release opens or updates the
separate `keycloak-27` PR. Each weekly run recreates the branch from current
`main` and force-pushes the current proposal, keeping the PR conversation while
removing stale commits. When `main` already contains the lane update, or when
`main` has advanced past an older lane, the workflow closes the stale PR and
deletes the branch.

The updater resolves `linux/amd64` registry manifests and records both the
platform manifest digest and the image config digest in the matching
`containers/<image>/image.lock.json` file. Keycloak updates also keep
`docker-compose.idp.yml`, both devcontainer Compose files and the developer
auth documentation on the same tag. SQL Server updates keep
`docker-compose.sqlserver.yml` and both devcontainer Compose files on the same
tag. nginx currently has no static devcontainer or integration-test Compose
reference outside the generated stack.

The updater workflow does not run the full test suite. It creates or updates
the PR, and the normal PR workflows validate the change. To make those PR
workflows run automatically from automation-created PRs, configure a
`VENDOR_IMAGE_UPDATE_TOKEN` secret from a fine-scoped PAT or GitHub App token
that can push branches and create pull requests. If the secret is absent, the
workflow falls back to `github.token`; that fallback can update branches and
PRs when repository settings allow it, but GitHub may suppress downstream PR
workflow runs that are triggered by the built-in token.

## Release Evidence

The GitHub Release page already shows the release tag, commit and workflow
provenance. The generated release body therefore focuses on the `Container
Images` section with semantic GHCR tags for normal pulls, the immutable GHCR
manifest digest references for `app-runtime` and `db-job` verification, and
the production deployment bundle assets. Stable releases use normal GitHub
Releases; preview releases are marked as pre-releases and are kept as part of
the release evidence.

The `Container Images` section groups entries by container package, adds a
short purpose description for each image, and lists every published tag for
that release. Those tag entries link to the repository package version URL for
the exact tag when the GitHub Packages API is available during release-note
generation, for example
`https://github.com/<owner>/<repo>/pkgs/container/<package>/<version-id>?tag=<tag>`.
If the package-version lookup is unavailable, the notes fall back to the
repository package page.

Release notes also include automatic change notes. Stable releases compare
against the previous published stable GitHub Release. Preview releases compare
against the previous published pre-release GitHub Release. When no previous
release of the same kind exists, the workflow does not let GitHub pick another
release kind as the changelog boundary.

The workflow asks GitHub to generate the `What's Changed` section with
`.github/release.yml`. That file groups pull requests by repository labels and
uses `Other Changes` as a catch-all so unlabeled merged work still appears.
Only pull requests labeled `ignore-for-release` are excluded from the generated
section. If GitHub-generated notes are unavailable, the release still publishes
with the runtime evidence below.

Each trusted run also writes runtime evidence:

- `container-stack.lock.json` lists the exact image name, tag,
  `manifestDigest`, `imageId`, source and role for `app-runtime`, `db-job`,
  nginx, SQL Server and Keycloak.
- `container-stack.compose.yml` is the generated Compose file that the smoke
  test started.
- `hashes.sha256` contains checksums for saved runtime evidence.
- `public/build.json` contains the app version, commit SHA, build time and
  image tag embedded in the tested app image.

The workflow uploads these artifact groups:

- `container-release-runtime-*` for Compose, stack lock, status, build
  metadata and hashes.
- `container-release-metadata-*` for GitVersion, release metadata, release
  notes and SBOM files.
- `container-release-playwright-*` for the release-smoke report,
  screenshots, traces and test results.
- `container-release-deployment-*` for the production deployment bundle and
  its flat checksum.

The production deployment bundle includes `bin/kravhantering-images.sh`, a
Bash and jq helper for explicit operator verification. It can verify configured
tag-style `release.env` image refs against locked image IDs, export already
present verified local images into a transport bundle, and load and tag that
bundle on a disconnected host.

The production deployment bundle is also uploaded to GitHub Releases as:

- `kravhantering-production-deploy-<version>.tar.gz`
- `kravhantering-production-deploy-<version>.tar.gz.sha256`

Markdown files in the deployment bundle bring along local image links. Keep
release-guide diagrams under `docs/images/`. Use `public/` only for content
that the deployed Next.js application intentionally serves at runtime, because
the app-runtime image copies that directory into the container.

See [rhel10-production-deploy.md](./rhel10-production-deploy.md) for the
enterprise app-node workflow with external SQL Server and external IdP. See
[rhel10-production-single-node-self-contained-deploy.md](./rhel10-production-single-node-self-contained-deploy.md)
for the self-contained single-node workflow with bundled SQL Server and
Keycloak.
The bundle also includes the matching topology-specific disconnected guides,
upgrade guides and uninstall guides. The disconnected guides document how
operators create a transferable bundle that contains the production deployment
archive, its checksum, exported images, image refs and hashes.

## Public GHCR Packages

The packages should be public if users must be able to pull the release
artifacts anonymously:

- `ghcr.io/<owner>/kravhantering-app-runtime`
- `ghcr.io/<owner>/kravhantering-db-job`
<!-- cSpell:ignore opencontainers -->
The publish steps attach `org.opencontainers.image.description` as both an
image label and a manifest annotation. GHCR reads labels for normal image
metadata, and its package UI needs the annotation form for images published
through manifest/index-style Buildx outputs.

GHCR visibility is managed outside the workflow through package settings or the
organization defaults for new packages. The workflow does not change package
visibility and does not check the GitHub Packages API after publishing. GitHub
normally makes new packages private on first publication unless the organization
has selected a different default.

GHCR can also show digest-derived `sha256-*` entries for release evidence, such
as registry-pushed attestations or Cosign signature helper artifacts. Those
entries are evidence for the image manifest digest, not runnable `app-runtime`
or `db-job` release images. GitHub Packages sorts package versions by publish
time, so an evidence entry created after the image push can appear above the
semantic version tag and be suggested by the package UI as the latest
command-line install target. The workflow keeps GitHub Artifact Attestations
out of GHCR and does not push Cosign image signatures to GHCR for that reason.
Treat the GitHub Release notes, `container-stack.lock.json`, and the semantic
image tags as the release source of truth; do not use `sha256-*` evidence
entries as production image tags.

GitHub warns that a package made public cannot be made private again. Only make
the packages public when anonymous pulls and review without GitHub
authentication are intentional.

## Tokens and Keys

The workflow uses the built-in `GITHUB_TOKEN` that GitHub Actions creates for
the run. Normal publishing does not require private deploy keys, PAT secrets, or
signing keys.

The repository or organization GitHub Actions setting must allow `GITHUB_TOKEN`
to have write permissions. The workflow requests these permissions:

- `packages: write` to log in to GHCR and push `app-runtime` and
  `db-job`.
- `contents: write` to create preview tags and create or update the GitHub
  Release with artifacts.
- `id-token: write` for GitHub Artifact Attestations.
- `attestations: write` to publish provenance and SBOM attestations.

The GHCR packages must also allow the workflow in this repository to write to
the packages. For new packages, the first publication from the workflow is
usually enough. For packages that already exist, the package's **Manage Actions
access** settings may need to grant this repository write or admin access.

Do not add a registry-pushed `cosign sign` step to this flow unless the
signatures are deliberately stored outside the runnable image packages. Cosign's
default registry storage creates digest-derived signature tags that GHCR can
display as recent package versions.

## Verification

Release notes contain the `Container Images` section and immutable manifest
digest references. Use the semantic tags for normal pulls and the manifest
digest references for verification. A user can verify a published app image
with:

<!-- markdownlint-disable MD013 -->
```bash
gh attestation verify \
  oci://ghcr.io/<owner>/kravhantering-app-runtime@sha256:<digest> \
  --repo <owner>/<repo> \
  --signer-workflow <owner>/<repo>/.github/workflows/container-release.yml
```
<!-- markdownlint-enable MD013 -->

Use the corresponding `db-job` manifest digest reference from the release notes
to verify the `db-job` image. Production runtime verification is separate:
after choosing site-specific tag-style image refs in `release.env`, pull those
refs when the host can reach the registry, then run the bundled
`bin/kravhantering-images.sh verify` command for the target topology to compare
Podman image inspect `.Id` values with the locked `imageId` values. Third-party
upstream tags can move after release, so production sites should prefer
release-specific internal mirror tags and treat the lock file as the source of
truth. For disconnected transport, export only after the source host has
already pulled and verified the local refs.
