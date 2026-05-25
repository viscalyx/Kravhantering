# Release Artifact Production Deployment

Production deployment must be possible from a GitHub Release and an internal
artifact registry without cloning the repository on the target RHEL host. We
publish a versioned deployment bundle with Compose files, configuration
templates, the deployment guide, release metadata and checksums.

The release lock records each image's registry manifest digest for provenance,
signing, attestations and upstream release smoke tests, and records each image
ID for runtime equivalence checks after internal-registry mirroring or offline
transport. Production sites may pull from upstream manifest-digest refs,
internal registry refs, or offline image bundles. Operators verify the
configured runtime image refs against the locked image IDs before first start
and upgrade migrations. This keeps the runtime contract reviewable and
repeatable without requiring internal mirrors to preserve upstream manifest
digests, while leaving site-specific secrets, certificates and registry
operations under operations control.
