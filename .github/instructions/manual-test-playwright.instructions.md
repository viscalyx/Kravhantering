---
applyTo: "{docs/governance/manuella-testfall.md,tests/integration/**/*.ts}"
---

# Manual Test and Playwright Lockstep

## Coverage Contract

- Treat `docs/governance/manuella-testfall.md` as the source of truth for
  Playwright scenario coverage.
- Keep each manual test case add, change, rename, or removal synchronized with
  the matching Playwright spec in the same change.
- Change `tests/integration/**/*.spec.ts` only with a production
  user-interaction or functionality change and the matching manual-case update.
- Include the matching manual case ID or IDs in each Playwright scenario title.
- Do not make spec-only behavior changes. If the requested work is
  selector-only, flake-only, title-only, setup-only, or refactor-only spec
  maintenance, stop and ask for explicit scope change before editing specs.
- Do not change production code only to satisfy these tests. If a spec exposes
  a production defect, let the user decide the production change.

## Authorization

- Keep authorization Playwright coverage split by the documented role-matrix
  phases in `AUTH-11` and `AUTHZ-*`.
- Preserve dedicated role storage states in `tests/integration/global-setup.ts`
  when authorization tests depend on them.
