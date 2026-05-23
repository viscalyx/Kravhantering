# Trusted Container Publishing

The trusted container flow runs from `.github/workflows/container-release.yml`
for `main`, stable `vX.Y.Z` tags, and manual workflow runs.

The workflow builds `app-runtime` and `db-job`, publishes them to GHCR, locks
each image to a digest in `container-stack.lock.json`, signs the digest with
Cosign keyless signing, and creates GitHub Artifact Attestations for provenance
and SBOM. The release smoke test then starts Podman Compose from the verified
digest references, not from mutable tags.

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
