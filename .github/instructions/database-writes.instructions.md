---
applyTo: "{lib/dal/**/*.ts,lib/requirements/service*.ts,app/api/**/*.ts}"
---

# Database Writes

## Atomic Multi-Table Mutations

- Treat one logical mutation that writes `2+` tables as one atomic database operation.
- Use the active DB client's supported atomic primitive: `db.transaction(...)` on the `SqlServerDatabase` wrapper, which delegates to the underlying TypeORM `DataSource.transaction(...)`.
- Do not emit raw SQL `BEGIN`, `COMMIT`, `ROLLBACK`, or `SAVEPOINT` directly from DAL or route code; keep transaction orchestration inside the DB client/provider layer.
- Do not split multi-table write orchestration across route handlers and separate non-atomic DAL calls.
- Prefer one DAL or service helper that owns the full multi-table mutation.
- If atomic execution is impossible, implement deterministic cleanup in the same helper before returning success.

## Assignment Authorization

- For requirement, requirement-area, requirement-package, and requirements
  specification writes, resolve the target resource before writing and enforce
  the shared assignment policy for the requested action.
- Do not infer requirements specification access from requirement-area
  authorship. Specification reads and writes use specification responsibility
  assignments: responsible HSA-id, co-author HSA-id, or an applicable global
  role such as `Admin` or `Reviewer` where the policy explicitly allows it.
- Manager-only assignment writes must remain manager-only in both HSA-id
  verification routes and the final mutation route.

## Verification

- Add or update focused tests for rollback behavior when one step fails.
- Add or update focused tests for duplicate or no-op paths when cleanup or conflict handling depends on insert counts.
- Add or update focused tests for invalid cross-table references or ownership checks.
