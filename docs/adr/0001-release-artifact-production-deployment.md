# Release Artifact Production Deployment

Production deployment must be possible from a GitHub Release and an internal
artifact registry without cloning the repository on the target RHEL host. We
publish a versioned deployment bundle with Compose files, configuration
templates, the deployment guide, release metadata and checksums.

The release lock records each image's registry manifest digest for provenance,
signing, attestations and upstream release smoke tests, and records each image
ID for runtime equivalence checks after internal-registry mirroring or offline
transport. Production runtime refs in `release.env` use tag-style `image:tag`
values, derived from `container-stack.lock.json` or from site-approved internal
mirror refs. Operators pull those tag refs when registry access is available,
or load an offline image bundle and tag the loaded image IDs to the configured
refs. Operators verify the configured runtime image refs against the locked
image IDs before first start and upgrade migrations. This keeps the runtime
contract reviewable and repeatable even when third-party upstream tags move
after release. Production sites should prefer release-specific internal mirror
tags for vendor images while leaving site-specific secrets, certificates and
registry operations under operations control.
