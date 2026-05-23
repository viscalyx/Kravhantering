# Release Artifact Production Deployment

Production deployment must be possible from a GitHub Release and an internal
artifact registry without cloning the repository on the target RHEL host. We
publish a versioned deployment bundle with Compose files, configuration
templates, the deployment guide, release metadata and checksums, while images
are mirrored internally with their released digests preserved. This keeps the
runtime contract reviewable and repeatable, while leaving site-specific
secrets, certificates and registry mirroring under operations control.
