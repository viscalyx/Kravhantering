---
applyTo: '{.devcontainer/Dockerfile,.github/workflows/quality-checks.yml,tests/unit/github-actions-workflow-security.test.ts}'
---

## Lychee Toolchain

- Change `LYCHEE_VERSION` and workflow `lycheeVersion` in the same change.
- Keep the version-alignment test passing.
- Keep the Lychee action pinned to a full commit SHA with its release tag comment.
