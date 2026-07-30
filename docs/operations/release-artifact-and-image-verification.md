# Release Artifact And Image Verification

<!-- cSpell:words jsonl Sigstore signer -->

This guide describes the release evidence checks that production operators use
before deploying or mirroring Kravhantering container images. Use it together
with the deployment, disconnected deployment, or upgrade guide for the selected
RHEL 10 topology.

For the release engineering workflow that publishes the images and evidence,
see
[Trusted Container Publishing](../development/trusted-container-publishing.md).

## Release Source Of Truth

Release notes contain the `Container Images` section and immutable manifest
digest references. They also contain the
`Deployment archive provenance verification` section for the exact production
deployment archive digest. Use semantic tags for normal pulls and manifest
digest references for image attestation verification.

Treat the GitHub Release notes, `container-stack.lock.json`, and semantic image
tags as the release source of truth. Do not use GHCR `sha256-*` evidence
entries as production image tags. Those entries may represent registry-pushed
attestations or signature helper artifacts, not runnable `app-runtime` or
`db-job` release images.

## Verify The Deployment Archive

SHA-256 verification and provenance verification answer different questions:

- `sha256sum -c` detects corruption or replacement during transfer when the
  checksum itself is trusted.
- The identity-bound attestation proves that the exact archive digest was
  attested by the expected Kravhantering repository and release workflow.

Connected sites must complete provenance verification before extracting the
archive. Disconnected sites must use the
[offline verification procedure](#offline-verification). A site may skip
provenance verification only under an explicitly approved disconnected
exception and must record that approval in the release handoff. The SHA-256
check remains required in every case.

Use an organization-approved GitHub CLI version for which
`gh attestation verify --help` lists `--signer-workflow`, `--source-digest`,
`--source-ref`, `--predicate-type`, `--bundle`, and
`--custom-trusted-root`. Do not copy an unapproved executable into the release
archive. See GitHub's
[attestation verification command reference](https://cli.github.com/manual/gh_attestation_verify)
and
[offline verification procedure](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline).

The `PREDICATE_TYPE` URI below is a repository-owned identifier for the signed
predicate contract. Verification compares it as a string; it does not fetch
code, schemas, or trust material from that address. Trust instead comes from
the GitHub OIDC certificate, Sigstore bundle, and approved trusted roots.

The release notes provide the exact source commit, source ref, release tag, and
asset names. Stable releases use `refs/tags/v<version>` as their source ref.
Preview releases are signed by the workflow run on `refs/heads/main`; their
later-created preview tag is signed release metadata, not the certificate
source ref.

Set the expected values from the release notes:

```bash
VERSION=1.2.3
RELEASE_TAG="v${VERSION}"
SOURCE_COMMIT="<exact 40-character commit from the release notes>"
# Stable:
SOURCE_REF="refs/tags/${RELEASE_TAG}"
# Preview instead:
# SOURCE_REF="refs/heads/main"

REPOSITORY="viscalyx/Kravhantering"
SIGNER_WORKFLOW="${REPOSITORY}/.github/workflows/container-release.yml"
PREDICATE_TYPE="https://github.com/viscalyx/Kravhantering/attestations/deployment-release/v1"
ARCHIVE="kravhantering-production-deploy-${VERSION}.tar.gz"
```

For required connected verification, GitHub CLI retrieves the attestation
associated with the archive digest:

<!-- markdownlint-disable MD013 -->
```bash
verification="$(
  gh attestation verify "$ARCHIVE" \
    --repo "$REPOSITORY" \
    --signer-workflow "$SIGNER_WORKFLOW" \
    --source-digest "$SOURCE_COMMIT" \
    --source-ref "$SOURCE_REF" \
    --predicate-type "$PREDICATE_TYPE" \
    --format json
)"

archive_digest="$(sha256sum "$ARCHIVE" | cut -d ' ' -f1)"
jq -e \
  --arg digest "$archive_digest" \
  --arg name "$ARCHIVE" \
  --arg repository "$REPOSITORY" \
  --arg source_digest "$SOURCE_COMMIT" \
  --arg source_ref "$SOURCE_REF" \
  --arg version "$VERSION" \
  --arg tag "$RELEASE_TAG" \
  'any(.[];
    .verificationResult.statement as $statement
    | $statement.predicate.schemaVersion == 1
    and $statement.predicate.repository == $repository
    and $statement.predicate.source.commitSha == $source_digest
    and $statement.predicate.source.ref == $source_ref
    and $statement.predicate.release.version == $version
    and $statement.predicate.release.tag == $tag
    and any($statement.subject[];
      .name == $name and .digest.sha256 == $digest
    )
  )' <<< "$verification" >/dev/null
```
<!-- markdownlint-enable MD013 -->

Do not extract the archive if either command fails.

### Offline Verification

Every preview and stable GitHub Release carries these files beside its archive
and checksum:

- `kravhantering-production-deploy-<version>.tar.gz.sigstore.json`
- `kravhantering-production-deploy-<version>.tar.gz.trusted-root.jsonl`

The first file is the archive's Sigstore bundle. The second is current trusted
root material generated by the release workflow. Internal and disconnected
handoffs must retain both files. Generate new trusted-root material for each
new signed handoff because Sigstore key material rotates.

Treat the trusted-root file as a trust anchor. Import it through the site's
authenticated release-handoff procedure and retain the approval record or an
out-of-band digest. An adjacent checksum alone does not establish that a
replacement trusted-root file is authentic.

Before extraction, set the same expected values as in connected verification
and verify without network access:

<!-- markdownlint-disable MD013 -->
```bash
BUNDLE="${ARCHIVE}.sigstore.json"
TRUSTED_ROOT="${ARCHIVE}.trusted-root.jsonl"

verification="$(
  gh attestation verify "$ARCHIVE" \
    --repo "$REPOSITORY" \
    --signer-workflow "$SIGNER_WORKFLOW" \
    --source-digest "$SOURCE_COMMIT" \
    --source-ref "$SOURCE_REF" \
    --predicate-type "$PREDICATE_TYPE" \
    --bundle "$BUNDLE" \
    --custom-trusted-root "$TRUSTED_ROOT" \
    --format json
)"

archive_digest="$(sha256sum "$ARCHIVE" | cut -d ' ' -f1)"
jq -e \
  --arg digest "$archive_digest" \
  --arg name "$ARCHIVE" \
  --arg repository "$REPOSITORY" \
  --arg source_digest "$SOURCE_COMMIT" \
  --arg source_ref "$SOURCE_REF" \
  --arg version "$VERSION" \
  --arg tag "$RELEASE_TAG" \
  'any(.[];
    .verificationResult.statement as $statement
    | $statement.predicate.schemaVersion == 1
    and $statement.predicate.repository == $repository
    and $statement.predicate.source.commitSha == $source_digest
    and $statement.predicate.source.ref == $source_ref
    and $statement.predicate.release.version == $version
    and $statement.predicate.release.tag == $tag
    and any($statement.subject[];
      .name == $name and .digest.sha256 == $digest
    )
  )' <<< "$verification" >/dev/null
```
<!-- markdownlint-enable MD013 -->

This procedure uses only the approved GitHub CLI executable, the archive, its
bundle, and trusted roots. It does not query GitHub or GHCR.

## Verify Published Image Attestations

Published release assets include the complete per-image Grype JSON reports,
`grype-db-status.json` and `vulnerability-policy-decision.json`. The decision
binds each report and SBOM hash to the same candidate manifest digest that the
workflow verifies first through a non-promoted remote staging identity and then
after final GHCR tag promotion. A successful release has no unexcepted fixable
High or Critical finding and no invalid, expired or stale committed exception.

Verify the published app image with the manifest digest reference from the
release notes:

<!-- markdownlint-disable MD013 -->
```bash
gh attestation verify \
  oci://ghcr.io/<owner>/kravhantering-app-runtime@sha256:<digest> \
  --repo <owner>/<repo> \
  --signer-workflow <owner>/<repo>/.github/workflows/container-release.yml
```
<!-- markdownlint-enable MD013 -->

Use the corresponding `db-job` manifest digest reference from the release notes
to verify the `db-job` image.

## Verify Runtime Image IDs

Production runtime verification is separate from attestation verification. After
choosing site-specific tag-style image refs in `release.env` by default, pull
those refs when the host can reach the registry. Then run the bundled
`bin/kravhantering-images.sh verify` command for the target topology to compare
Podman image inspect `.Id` values with the locked `imageId` values.

The helper also accepts `image:tag@sha256:digest` refs when a site explicitly
requires pull-time digest pinning.

Production topologies use `container-stack.lock.json`. The test-only
`single-node-demo` topology uses both `container-stack.lock.json` and
`container-test-support.lock.json`.

Third-party upstream tags can move after release. Production sites should
prefer release-specific internal mirror tags and treat the lock file as the
source of truth.

For disconnected transport, export only after the source host has already
pulled and verified the local refs.
