# Release Artifact And Image Verification

<!-- cSpell:words signer -->

This guide describes the release evidence checks that production operators use
before deploying or mirroring Kravhantering container images. Use it together
with the deployment, disconnected deployment, or upgrade guide for the selected
RHEL 10 topology.

For the release engineering workflow that publishes the images and evidence,
see
[Trusted Container Publishing](../development/trusted-container-publishing.md).

## Release Source Of Truth

Release notes contain the `Container Images` section and immutable manifest
digest references. Use semantic tags for normal pulls and the manifest digest
references for attestation verification.

Treat the GitHub Release notes, `container-stack.lock.json`, and semantic image
tags as the release source of truth. Do not use GHCR `sha256-*` evidence
entries as production image tags. Those entries may represent registry-pushed
attestations or signature helper artifacts, not runnable `app-runtime` or
`db-job` release images.

## Verify Published Image Attestations

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
choosing site-specific tag-style image refs in `release.env`, pull those refs
when the host can reach the registry. Then run the bundled
`bin/kravhantering-images.sh verify` command for the target topology to compare
Podman image inspect `.Id` values with the locked `imageId` values.

Production topologies use `container-stack.lock.json`. The test-only
`single-node-demo` topology uses both `container-stack.lock.json` and
`container-test-support.lock.json`.

Third-party upstream tags can move after release. Production sites should
prefer release-specific internal mirror tags and treat the lock file as the
source of truth.

For disconnected transport, export only after the source host has already
pulled and verified the local refs.
