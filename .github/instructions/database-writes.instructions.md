---
applyTo: "{lib/dal/**/*.ts,lib/requirements/**/*.ts,lib/access-review/**/*.ts,lib/archiving/**/*.ts,lib/privacy/erasure.ts,app/api/**/*.ts}"
---

# Database Writes

## Atomic Mutations

- Keep all database steps of one logical mutation, including its required
  Action log entry, in one TypeORM transaction.
- Use `DataSource.transaction(...)` or a supported transactional QueryRunner;
  propagate the transactional manager to every required database step.
- Keep transaction ownership in one DAL or service helper.
- Keep raw `BEGIN`, `COMMIT`, `ROLLBACK` and `SAVEPOINT` statements out of
  application DAL and route orchestration.
- Propagate unexpected database errors out of the transaction callback.
- Continue after an expected conflict only under an explicit operation
  contract verified against SQL Server.
- Preserve the original failure when rollback or cleanup also fails.
- Emit external Security audit log success only after confirmed commit.
- Keep external-sink failure from reporting a committed mutation as rolled
  back; preserve the existing best-effort delivery contract.
- Keep retries operation-specific. Report uncertain write or commit outcomes
  without claiming rollback; inspect saved state before repeating work.

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
