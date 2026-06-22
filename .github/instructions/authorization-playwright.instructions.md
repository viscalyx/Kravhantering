---
applyTo: "{docs/governance/manuella-testfall.md,tests/integration/authorization/**/*,!tests/integration/authorization/**/AGENTS.md,tests/integration/global-setup.ts,tests/unit/playwright-global-setup.test.ts}"
---

# Authorization Playwright Tests

- Keep `docs/governance/manuella-testfall.md` and `tests/integration/authorization/**`
  synchronized for every authorization scenario.
- Keep authorization Playwright coverage split by the ten documented phases:
  no-role/no-assignment baseline, six assignment-based permissions, `Admin`,
  `Reviewer`, and `PrivacyOfficer`.
- Reference the matching `AUTH-*` manual case IDs in each authorization
  `*.spec.ts` test.
- When adding, changing, or removing authorization Playwright cases, update the
  matching manual test case in the same change.
- When adding manual authorization cases that should guard the role matrix, add
  or update the matching Playwright coverage in `tests/integration/authorization`.
- Keep each `*.spec.ts` file in `tests/integration/authorization` aligned with
  its companion `*.md` test-flow document.
- Preserve dedicated role storage states in `tests/integration/global-setup.ts`
  when authorization tests depend on them.
- Do not change production code to satisfy these tests. If the test exposes a
  production authorization defect, let the user decide
