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

Release/demo support also publishes the HSA person lookup Adapter, directory
mock, and one-shot mTLS provisioner with separate provenance and SPDX
attestations. Verify their exact manifest references with the same command
before mirroring or disconnected export. These images are not dependencies of
the supported production topology; production deployments leave the HSA URL
unset or supply site-owned strict material for an approved external facade.
<!-- markdownlint-enable MD013 -->

Use the corresponding `db-job` manifest digest reference from the release notes
to verify the `db-job` image.

## Interpret Container Vulnerability Tracking

The daily container vulnerability monitor creates one public `security` issue
for an affected release image version: an exact image role plus an immutable
published release tag. A stable tag is supported and monitored. A preview tag
is monitored for early visibility but is not supported. The issue title is not
its identity; the automation label and versioned marker are authoritative.

Only already-public Debian or GitHub npm advisory facts that pass the closed
authority classification appear in these issues. Use private vulnerability
reporting for a newly discovered or sensitive vulnerability. Do not place
confidential scanner observations in the public issue.

Interpret the lifecycle as follows:

- **Open and affected:** the issue body and active continuation bank are the
  complete latest trusted public scan state. Review every observation and the
  immutable manifest digest. A fixed version listed by an advisory does not
  change the immutable published image; users need a later release that no
  longer contains the affected package version.
- **Closed as completed:** the release image version remains monitored and its
  latest trusted scan has zero public observations. The issue can reopen if a
  later database or classification exposes a public recurrence. Completion is
  not a promise that a tagged image is rebuilt or backported.
- **`monitoring-ended`:** the release image version has left the forward-only
  monitored window after a complete replacement window reconciles. Automation
  preserves the last trusted state and never scans this identity again. An
  affected last-known state is not confirmed fixed and may still affect users.
  A clean last-known state does not establish current safety after monitoring
  ends.

The workflow validates the complete automation-owned tracker before selecting
release assets. If tracker state is ambiguous, malformed, or incomplete, or a
selected release intersects a trusted `monitoring-ended` identity, the run
stops before attestation and Grype scanning. Treat that failure as a tracker
integrity incident; do not remove lifecycle markers to force a rescan.

Material changes appear in immutable reconciliation journal comments before
the body changes. Added, Changed, and Removed sections describe changes in
trusted public facts; removal does not by itself claim a fix. Large current
state and journals use linked continuation parts. Follow the body-linked active
bank in order. Minimized inactive banks are retained recovery structure, not
current state. Human comments remain separate analysis.

Each root journal links the canonical workflow run and names a restricted
artifact retained for 30 days. The public link provides provenance and
lifecycle context only. Access to the artifact follows repository permissions,
and its unfiltered SBOM, Grype, classification, policy, tracker, and error
evidence must not be copied into the public issue.

A failed run uses ordinary GitHub Actions status and notifications. Inspect the
restricted artifact and the final step outcomes. The next daily run rereads the
complete state and is the automatic recovery path; manually dispatch the same
workflow for an earlier full retry. Do not target one release or issue, edit
automation markers, or create a publication-triggered workaround.

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

PR and release smoke validation installs the same production archive on Ubuntu
24.04 and captures the generated systemd units, live containment and network
inspection, database lifecycle, and restart/reinstall/removal evidence. This is
an archive-parity gate, not a replacement for RHEL qualification of SELinux,
firewalld, the supported RHEL Podman build, or persistence over a host reboot.
Its CI-only HSA overlay drives the authenticated production App route and
records the App-generated correlation identifier across App, Kong, Adapter,
and exactly one mock handling event. It also records role-specific read-only
mounts, file modes and ownership, listener reachability, the loopback-only Kong
Admin API, CA-and-leaf rotation metadata, stale-material rejection, finalization,
and injected-failure rollback for all three trust domains.

Third-party upstream tags can move after release. Production sites should
prefer release-specific internal mirror tags and treat the lock file as the
source of truth.

For disconnected transport, export only after the source host has already
pulled and verified the local refs.
