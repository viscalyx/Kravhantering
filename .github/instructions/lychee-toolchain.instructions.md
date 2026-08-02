---
applyTo: '{.devcontainer/Dockerfile,.github/workflows/quality-checks.yml,scripts/azure-dev/templates/bootstrap-host.sh,tests/unit/github-actions-workflow-security.test.ts}'
---

## Lychee Toolchain

- Keep both `LYCHEE_VERSION` values and workflow `lycheeVersion` aligned.
- When changing Lychee, update both architecture-specific `lychee_sha256`
  values in the Dockerfile and Azure host bootstrap.
- Keep the version-alignment test passing.
- Keep the Lychee action pinned to a full commit SHA with its release tag comment.
- Keep the `lychee-toolchain` issue lane in
  `.github/dependency-maintenance.json` and the scheduled dependency-drift
  workflow active. Its current and available state must include both
  architecture checksums.
- A detector-created Lychee issue must identify all synchronized surfaces and
  require both installer versions, workflow `lycheeVersion`, and both
  architecture checksums to change together. Keep detector tests relational;
  do not assert whichever Lychee release is currently latest.
