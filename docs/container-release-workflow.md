# Trusted Container Publishing

The trusted container flow runs from `.github/workflows/container-release.yml`
for `main`, stable `vX.Y.Z` tags, and manual workflow runs.

The workflow builds `app-runtime` and `db-job`, publishes them to GHCR, and
records two image identities in `container-stack.lock.json`. The
`manifestDigest` is the registry manifest digest used for Cosign keyless
signing, GitHub Artifact Attestations, SBOM subjects and GHCR release smoke
tests. The `imageId` is the container image ID used by production operators to
verify runtime equivalence after tag-based pulls, internal-registry mirroring
or offline image transport. The release smoke test starts Podman Compose from
verified GHCR manifest digest references, but production deployment and upgrade
guides use tag-style runtime refs and verify them against locked image IDs.

The Buildx publish steps disable BuildKit's default registry provenance
attestations with `--provenance=false`. The workflow publishes provenance and
SBOM evidence explicitly through GitHub Artifact Attestations, while keeping the
Buildx metadata shape stable enough to record both `manifestDigest` and
`imageId`.

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
tag. nginx updates keep the public direct-pull example in
`containers/production/env/release.env.template` aligned with the lock; nginx
has no static devcontainer or integration-test Compose reference outside the
generated stack.

The updater workflow does not run the full test suite. It creates or updates
the PR, and the normal PR workflows validate the change. To make those PR
workflows run automatically from automation-created PRs, configure a
`VENDOR_IMAGE_UPDATE_TOKEN` secret from a fine-scoped PAT or GitHub App token
that can push branches and create pull requests. If the secret is absent, the
workflow falls back to `github.token`; that fallback can update branches and
PRs when repository settings allow it, but GitHub may suppress downstream PR
workflow runs that are triggered by the built-in token.

## Release Evidence

GitHub Release notes are the first place to find the tested release version,
the GHCR manifest digest references for `app-runtime` and `db-job`, and the
published checksums. Stable releases use normal GitHub Releases; preview
releases are marked as pre-releases and are kept as part of the audit trail.

Release notes also include automatic change notes. Stable releases compare
against the previous published non-prerelease GitHub Release. Preview releases
compare against the previous published prerelease GitHub Release. When no
previous release of the same kind exists, the workflow does not let GitHub pick
another release kind as the changelog boundary; it records all first-parent
commits reachable from the release commit instead.

The workflow asks GitHub to generate the `What's Changed` section with
`.github/release.yml`. That file groups pull requests by repository labels and
uses `Other Changes` as a catch-all so unlabeled merged work still appears.
Only pull requests labeled `ignore-for-release` are excluded from the generated
section. Every release note also includes an `Exact Commit Range` section with
the first-parent commits in the selected range, including short SHA, date,
author and subject. If GitHub-generated notes are unavailable, the release still
publishes with the exact commit list and the runtime evidence below.

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
bundle on an offline host.

The production deployment bundle is also uploaded to GitHub Releases as:

- `kravhantering-production-deploy-<version>.tar.gz`
- `kravhantering-production-deploy-<version>.tar.gz.sha256`

Markdown files in the deployment bundle bring along local image links. Keep
release-guide diagrams under `docs/images/`. Use `public/` only for content
that the deployed Next.js application intentionally serves at runtime, because
the app-runtime image copies that directory into the container.

See [rhel10-production-deploy.md](./rhel10-production-deploy.md) for the
enterprise app-node workflow with external SQL Server and external IdP. See
[rhel10-production-single-node-internal-deploy.md](./rhel10-production-single-node-internal-deploy.md)
for the controlled all-in-one internal workflow.
The bundle also includes the matching uninstall guides for reversing a first
install.

## Public GHCR Packages

The packages should be public if users must be able to pull the release
artifacts anonymously:

- `ghcr.io/<owner>/kravhantering-app-runtime`
- `ghcr.io/<owner>/kravhantering-db-job`

GHCR visibility is managed outside the workflow through package settings or the
organization defaults for new packages. The workflow does not change package
visibility and does not check the GitHub Packages API after publishing. GitHub
normally makes new packages private on first publication unless the organization
has selected a different default.

GitHub warns that a package made public cannot be made private again. Only make
the packages public when anonymous pulls and review without GitHub
authentication are intentional.

## Tokens and Keys

The workflow uses the built-in `GITHUB_TOKEN` that GitHub Actions creates for
the run. Normal publishing does not require private deploy keys, PAT secrets, or
Cosign keys.

The repository or organization GitHub Actions setting must allow `GITHUB_TOKEN`
to have write permissions. The workflow requests these permissions:

- `packages: write` to log in to GHCR and push `app-runtime` and
  `db-job`.
- `contents: write` to create preview tags and create or update the GitHub
  Release with artifacts.
- `id-token: write` for Cosign keyless signing and GitHub Artifact
  Attestations.
- `attestations: write` to publish provenance and SBOM attestations.

The GHCR packages must also allow the workflow in this repository to write to
the packages. For new packages, the first publication from the workflow is
usually enough. For packages that already exist, the package's **Manage Actions
access** settings may need to grant this repository write or admin access.

Cosign runs with GitHub OIDC and issues a short-lived certificate for the
current workflow identity. Do not create a `COSIGN_PRIVATE_KEY`,
`COSIGN_PASSWORD`, or separate signing secret for this flow.

## Verification

Release notes contain exact manifest digest references and checksums. A user
can verify a published app image with:

<!-- markdownlint-disable MD013 -->
```bash
cosign verify \
  --certificate-identity "https://github.com/<owner>/<repo>/.github/workflows/container-release.yml@refs/tags/vX.Y.Z" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/<owner>/kravhantering-app-runtime@sha256:<digest>

gh attestation verify \
  oci://ghcr.io/<owner>/kravhantering-app-runtime@sha256:<digest> \
  --repo <owner>/<repo>
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
truth. For offline transport, export only after the source host has already
pulled and verified the local refs.
