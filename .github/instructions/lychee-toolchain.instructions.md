---
applyTo: '{.devcontainer/Dockerfile,.github/workflows/quality-checks.yml,scripts/azure-dev/templates/bootstrap-host.sh,tests/unit/github-actions-workflow-security.test.ts}'
---

## Lychee Toolchain

- Keep both `LYCHEE_VERSION` values and workflow `lycheeVersion` aligned.
- When changing Lychee, update both architecture-specific `lychee_sha256`
  values in the Dockerfile and Azure host bootstrap.
- Keep the version-alignment test passing.
- Keep the Lychee action pinned to a full commit SHA with its release tag comment.
