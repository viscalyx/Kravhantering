---
applyTo: "{scripts/db-sqlserver-admin.mjs,scripts/db-admin.mjs,lib/typeorm/sqlserver-config.ts,app/api/ready/route.ts,scripts/__tests__/db-sqlserver-admin*.test.mjs,docs/operations/rhel10-production*.md}"
---

## Database Operations

- Follow `database-schema.instructions.md` for seed ownership and upgrades.
- Provide versioned parseable results and a concise human summary for
  required reconciliation.
- Separate JSON output from human diagnostics. Report committed outcomes,
  including inserted, updated/repaired, unchanged and skipped entries.
- Return nonzero status for unexpected failures and required conflicts.
- Preserve run/release correlation and retained deployment evidence.
- Keep customer pipeline publication and notification policy platform-neutral.
