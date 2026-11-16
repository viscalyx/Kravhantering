---
applyTo: "{scripts/db-sqlserver-admin.mjs,scripts/db-admin.mjs,lib/typeorm/sqlserver-config.ts,lib/typeorm/runtime-verification.ts,app/api/ready/route.ts,scripts/__tests__/db-sqlserver-admin*.test.mjs,docs/operations/rhel10-production*.md}"
---

## Database Operations

- Follow `database-schema.instructions.md` for seed ownership and upgrades.
- Verify the app's actual resolved connection identity and effective
  permission contract before admitting traffic; reuse its execution context.
- Fail deployment verification on a mismatch or unverifiable result.
- Keep runtime verification separate from manifest-based permission
  reconciliation; preserve credential separation and connection precedence.
- Report committed migrations separately from later permission failures.
- Provide versioned parseable results and a concise human summary for
  migrations, required reconciliation and optional initialization.
- Separate JSON output from human diagnostics. Report committed outcomes,
  including inserted, updated/repaired, unchanged and skipped entries.
- For optional omissions, report logical identity, reason, dependency cause,
  required action and the absence of automatic retry.
- Retain success status for expected optional omissions; return nonzero
  status for unexpected failures and required conflicts.
- Preserve run/release correlation and retained deployment evidence.
- Keep customer pipeline publication and notification policy platform-neutral.
- Preserve engine-required autocommit boundaries; keep `SINGLE_USER` and
  `DROP DATABASE` together in their existing client batch.
- Preserve the documented tested recovery set and restore procedure after
  migrations start.
