# Dead Code Report Template

Use this template for the final report.

## Summary

- Confirmed dead findings: `<count>`
- Likely dead findings: `<count>`
- Possible future-use placeholder findings: `<count>`
- Total estimated removable lines: `<count>`

## Findings

| Id | Status | Type | What | Location | Why it is dead or dormant | Evidence | Estimated lines saved | Recommendation | Possible future use if kept |
| -- | ------ | ---- | ---- | -------- | ------------------------- | -------- | --------------------- | -------------- | --------------------------- |
| 1 | confirmed dead | orphaned file | Old helper module | `lib/old-helper.ts` | No imports, re-exports, routes, or script entrypoints reference the file. | `find_dead_code_candidates.py` reported `0` inbound refs; `rg -n "old-helper" .` only matched the declaration file. | 48 | Remove to shrink maintenance and review surface. | Could serve as a reference if the old parser design needs revisiting. |
| 2 | possible future-use placeholder | future-use seam | RBAC authorization policy seam | `lib/requirements/auth.ts` | The stricter implementation exists but default wiring still uses the permissive path while the repo documents RBAC as deferred work. | [TODO-rbac-plan.md](../../../docs/TODO-rbac-plan.md) documents deferred RBAC rollout; `docs/mcp-server-contributor-guide.md` says auth is planned but not enforced yet; the code defines both `AllowAllAuthorizationService` and `RoleBasedAuthorizationService`. | 0 | Keep until the RBAC rollout decision is complete, and add clarifying comments if the seam is confusing. | This seam can be used to enable role enforcement once the IdP and role mapping work lands. |

## Notes

- Use `confirmed dead`, `likely dead`, `possible future-use placeholder`, or
  `keep`.
- Use `whole file` or `lines X-Y` in working notes when calculating the
  line count.
- Keep evidence short and concrete.
- For `possible future-use placeholder`, cite both a documentation signal and
  a code-structure signal.
- Use `n/a` in `Possible future use if kept` when no credible reuse case
  exists.
