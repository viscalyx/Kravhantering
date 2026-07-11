---
applyTo: '{.devcontainer/Dockerfile,.github/workflows/quality-checks.yml,tests/unit/github-actions-workflow-security.test.ts}'
---

## Lychee Toolchain

- When changing Lychee, update `LYCHEE_VERSION`, workflow `lycheeVersion`, and
  both architecture-specific `lychee_sha256` values in the Dockerfile.
- Keep the version-alignment test passing.
- Keep the Lychee action pinned to a full commit SHA with its release tag comment.
