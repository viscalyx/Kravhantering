---
applyTo: "{lib/dal/**/*.ts,lib/requirements/service.ts,app/api/**/*.ts}"
---

# Database Writes

## Atomic Multi-Table Mutations

- Treat one logical mutation that writes `2+` tables as one atomic database operation.
- Use the active DB client's supported atomic primitive, such as `transaction()` on the local or proxy-backed SQLite client.
- Do not emit raw SQL `BEGIN`, `COMMIT`, `ROLLBACK`, or `SAVEPOINT` directly from DAL or route code; keep transaction orchestration inside the DB client/provider layer.
- Do not split multi-table write orchestration across route handlers and separate non-atomic DAL calls.
- Prefer one DAL or service helper that owns the full multi-table mutation.
- If atomic execution is impossible, implement deterministic cleanup in the same helper before returning success.

## Verification

- Add or update focused tests for rollback behavior when one step fails.
- Add or update focused tests for duplicate or no-op paths when cleanup or conflict handling depends on insert counts.
- Add or update focused tests for invalid cross-table references or ownership checks.
