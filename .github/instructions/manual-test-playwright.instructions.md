---
applyTo: "{docs/governance/manuella-testfall.md,tests/integration/**/*.ts}"
---

# Manual Test and Playwright Lockstep

## Coverage Contract

- Treat `docs/governance/manuella-testfall.md` as the source of truth for
  Playwright scenario coverage.
- When using `maintain-manual-tests`, use this catalog and its table of
  contents as the case collection and index. Use
  `docs/development/ci-integration-ownership.md` for test execution guidance.
  Preserve the existing documentation layout.
- Keep manual cases to functional workflows and user-observable accessibility.
  Do not include CSS-pixel measurements, target geometry, or visual layout
  inspection; cover those with automated checks.
- Keep each manual test case add, change, rename, or removal synchronized with
  the matching Playwright spec in the same change.
- Synchronize functional scenario changes with the matching manual cases.
- Allow selector, flake, title, setup, and refactoring maintenance without
  production changes when expected behavior and coverage remain intact.
  Update manual cases when their instructions or references change.
- Include the matching manual case ID or IDs in each Playwright scenario title.
- When adding, moving, renaming, or removing Playwright spec files under
  `tests/integration`, run `npm run test:integration:chunks:generate` and
  include the updated `tests/integration-chunks.manifest.json`.
- Keep shared integration setup and assertion helpers under `tests/support/`.
- Do not change production code only to satisfy these tests. If a spec exposes
  a production defect, let the user decide the production change.

## Authorization

- Keep authorization Playwright coverage split by the documented role-matrix
  phases in `AUTH-11` and `AUTHZ-*`.
- Preserve dedicated role storage states in `tests/integration/global-setup.ts`
  when authorization tests depend on them.
- Automated Playwright scenarios may use isolated AUTHZ fixtures instead of the
  deterministic seeded objects, as long as they verify the same roles,
  assignments, and positive and negative authorization boundaries.
