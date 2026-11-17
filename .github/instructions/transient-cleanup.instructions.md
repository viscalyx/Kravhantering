---
applyTo: "lib/transient-cleanup/**/*.ts"
---

## Incremental Cleanup

- Preserve bounded batches, completed progress, expiry checks and failure
  isolation between cleanup targets.
- Report remaining backlog and incomplete or uncertain deletion counts.
- Retain later scheduled attempts for remaining expired data.
