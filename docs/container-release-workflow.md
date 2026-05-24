# Trusted Container Publishing

The trusted container flow runs from `.github/workflows/container-release.yml`
for `main`, stable `vX.Y.Z` tags, and manual workflow runs.

The workflow builds `app-runtime` and `db-job`, publishes them to GHCR, locks
each image to a digest in `container-stack.lock.json`, signs the digest with
Cosign keyless signing, and creates GitHub Artifact Attestations for provenance
and SBOM. The release smoke test then starts Podman Compose from the verified
digest references, not from mutable tags.

## Reproducibility

The workflow uses the Node version from `.nvmrc` and installs dependencies with
`npm ci` using the npm bundled with that pinned runtime. Do not add
`npm install -g npm@latest` to this workflow. If npm must be upgraded
explicitly, pin the exact npm version and document the reason here.

Preview releases use GitVersion's `FullSemVer` or `SemVer` value, but Docker
image tags and GitHub preview tag names strip SemVer build metadata from the
first `+` onward. For example, `1.2.0-preview.4+Branch.main.Sha.abcdef`
becomes `1.2.0-preview.4`.

Local and release-smoke stack startup honor `--lock-file`. When the stack builds
local images, `run-local-stack.mjs` passes that path to
`generate-stack-lock.mjs` before `generate-compose.mjs` reads it.

## Release Evidence

GitHub Release notes are the first place to find the tested release version,
the GHCR digest references for `app-runtime` and `db-job`, and the published
checksums. Stable releases use normal GitHub Releases; preview releases are
marked as pre-releases and are kept as part of the audit trail.

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

- `container-stack.lock.json` lists the exact image name, tag, digest, source
  and role for `app-runtime`, `db-job`, nginx, SQL Server and Keycloak.
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

Release notes contain exact digest references and checksums. A user can verify a
published app image with:

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

Use the corresponding `db-job` reference from the release notes to verify the
`db-job` image.
