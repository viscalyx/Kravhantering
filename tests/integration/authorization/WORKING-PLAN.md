<!-- cSpell:words AUTHZ Keycloak specresp areaco noroles PkgCoAuthor -->

# Authorization Playwright Working Plan

Temporary working document for planning and logging the authorization
Playwright integration-test work.

## Constraints

- Do not change production code while planning or adding these tests.
- If a production authorization defect blocks a phase, create a detailed
  GitHub issue in `viscalyx/Kravhantering` and leave the fix to a fresh
  session.
- Keep `docs/manuella-testfall.md` and
  `tests/integration/authorization/**/*` synchronized for every scenario.
- Keep one phase per global role or kravansvar assignment.
- Align each phase with the manual cases in
  `docs/manuella-testfall.md`, primarily the detailed `AUTHZ-*` cases.

## Terminology

- Use global role for IdP roles such as `Admin`, `Reviewer`, and
  `PrivacyOfficer`.
- Use uppdrag or kravansvarstilldelning for HSA-id-based application-owned
  responsibility assignments such as kravområdesägare,
  kravområdesmedförfattare, kravunderlagsansvarig,
  kravunderlagsmedförfattare, kravpaketsansvarig, and
  kravpaketsmedförfattare.
- `docs/behörigheter.md` is the role and assignment matrix to guard.
- `CONTEXT.md` already defines `Behörighetssammanhang`, `Kravområde`,
  `Kravbibliotek`, `Kravunderlag`, and related Swedish domain terms.

## Current State Found

- `docs/manuella-testfall.md` will contain `AUTH-11`, covering ten
  authorization phases.
- `tests/integration/authorization/` already contains ten phase spec files and
  one companion markdown file per phase.
- The current authorization spec files mostly exercise API authorization
  directly through `APIRequestContext`.
- Existing click-through UI coverage in the authorization specs is currently
  limited to the forbidden kravunderlag surface and Admin Center tab gating.
- Role storage states already exist in `tests/integration/global-setup.ts` for
  all phase users.

## Planned Phase Split

0. Test identities and deterministic `AUTHZ*` seed data.
1. No global roles and no assignments: `noah.noroles`.
2. Kravområdesägare: `olle.areaowner`.
3. Kravområdesmedförfattare: `cora.coauthor`.
4. Kravunderlagsansvarig: `petra.specresp`.
5. Kravunderlagsmedförfattare: `signe.speccoauthor`.
6. Kravpaketsansvarig: `leo.pkglead`.
7. Kravpaketsmedförfattare: `paul.pkgcoauthor`.
8. Admin: `only.admin`.
9. Reviewer: `rita.reviewer`.
10. PrivacyOfficer: `disa.privacy`.

## Phase Planning Notes

### Phase 0: Test Identities And AUTHZ Seed Data

Planned work:

- Add `signe.speccoauthor` and `leo.pkglead` to the full dev/test identity
  chain.
- Add role-specific Playwright storage states for both users.
- Add deterministic seed data:
  - `AUTHZ-AREA-2026`, owned by `olle.areaowner`, with `cora.coauthor` as
    kravområdesmedförfattare.
  - `AUTHZ-SPEC-2026`, owned by `petra.specresp`, with
    `signe.speccoauthor` as kravunderlagsmedförfattare.
  - `AUTHZ-PKG-2026`, led by `leo.pkglead`, with `paul.pkgcoauthor` as
    kravpaketsmedförfattare.
- Update manual and developer documentation so each global role and each
  app-owned assignment maps to one distinct test person.
- Update unit tests for Keycloak realm users, Playwright global setup, and seed
  data.

Acceptance checks:

- Unit tests confirm the dev Keycloak realm contains both new users.
- Unit tests confirm Playwright global setup contains both storage states.
- Seed unit tests confirm the `AUTHZ*` objects and their responsibility people
  exist.
- Manual documentation lists one distinct person per role or assignment without
  reusing users across assignment phases.

### Phase 1: No Global Roles And No Assignments

Planned UI coverage:

- Open `/sv/requirements` and verify published requirements are visible while
  edit and review controls are unavailable.
- Open `/sv/specifications` and verify the list is empty or limited to assigned
  items.
- Open the fixture kravunderlag detail directly at mobile and desktop widths
  and verify the forbidden message, specification name, and responsible contact
  are visible without content actions.
- Open Admin Center/action-log entry points and verify privileged work is not
  available.

API boundary likely still needed:

- Anonymous JSON 401 for protected API access.
- AI model, credit, and generation denials, because there may be no complete UI
  route for every provider-bound request.

### Phase 2: Kravområdesägare

Planned UI coverage:

- Open `/sv/requirement-areas`.
- Edit the fixture requirement area description or name through the
  `Redigera` form.
- Open the same area's kravområdesmedförfattare controls and verify existing
  assignment handling is available.
- Verify Admin-only action-log access is not available.

### Phase 3: Kravområdesmedförfattare

Planned UI coverage:

- Open `/sv/privacy` and export the signed-in user's data, verifying the
  kravområdesmedförfattare assignment is represented.
- Open `/sv/requirement-areas` and verify metadata/delegation controls are
  unavailable or denied for the assigned area.

Known blocker:

- Requirement creation in the assigned area is documented as waiting for issue
  `#320`.

### Phase 4: Kravunderlagsansvarig

Planned UI coverage:

- Open the fixture kravunderlag detail.
- Verify content edit controls are available.
- Open `Redigera kravunderlag`, change a safe metadata field, and save.
- Open assignment-management controls and verify co-author management is
  available.

### Phase 5: Kravunderlagsmedförfattare

Planned UI coverage:

- Open the fixture kravunderlag detail.
- Verify content editing is available.
- Change a safe content metadata field or local content through the UI.
- Try assignment-management controls and verify co-author and responsible
  changes are unavailable or denied.

### Phase 6: Kravpaketsansvarig

Planned UI coverage:

- Open `/sv/requirements/stewardship?tab=packages`.
- Edit the fixture kravpaket metadata while preserving the co-author.
- Verify the package lead remains the same.
- Try archive controls and verify Admin-only archive is unavailable or denied.

### Phase 7: Kravpaketsmedförfattare

Planned UI coverage:

- Open the fixture kravpaket from the package list and verify the co-author is
  visible.
- Try package metadata editing and verify the update is unavailable or denied.
- Open `/sv/privacy` and export the signed-in user's data, verifying the
  kravpaketsmedförfattare assignment is represented.

### Phase 8: Admin

Planned UI coverage:

- Open `/sv/admin?tab=actionAuditLog` and verify `Åtgärdslogg` loads.
- Open `/sv/specifications` and verify broad kravunderlag listing.
- Open `/sv/admin?tab=privacy` and verify Admin tabs are enabled while
  `Arkivering` and `Dataskydd` are disabled.
- Try a PrivacyOfficer-only action through UI where possible.
- Try a Reviewer-only lifecycle decision through UI where possible.

### Phase 9: Reviewer

Planned UI coverage:

- Open `/sv/specifications` and verify broad kravunderlag listing.
- Open Admin Center access-review/action-log entry points and verify they are
  denied or disabled.
- Exercise a Reviewer-only requirement lifecycle decision through UI if a safe
  seeded review fixture exists.

### Phase 10: PrivacyOfficer

Planned UI coverage:

- Open `/sv/admin?tab=accessReview` and verify Behörighetsöversyn loads.
- Open `/sv/admin?tab=privacy`, run a privacy preview by HSA-id, and verify it
  loads.
- Open action-log entry points and verify they are denied or disabled.
- Open `/sv/admin?tab=actionAuditLog` and verify PrivacyOfficer tabs are
  enabled while `Identitet` and `Åtgärdslogg` are disabled.

## Resolved Decisions

- Resolved: "complete end-to-end click-through UI test" means user-facing
  authorization flows are exercised through browser navigation, clicks, and
  form input. API setup is allowed for isolated fixtures, and API assertions are
  allowed for boundaries without complete browser UI, such as anonymous JSON
  `401`, AI denials, and server-side security-boundary checks.
- Resolved: each authorization phase spec creates its own isolated fixture via
  API setup. Fixtures are not shared across phase files because Playwright may
  run files in parallel and each role phase should remain independently
  debuggable.
- Resolved: build the UI-first authorization coverage into the existing ten
  phase spec files instead of adding parallel `*.ui.spec.ts` files. Each phase
  spec remains the single automated counterpart to its companion markdown flow.
- Resolved: negative authorization tests first prove the visible user
  experience through UI, by checking that forbidden pages, missing controls, or
  disabled controls are shown correctly. Where the same action has a mutating
  server boundary, the phase also keeps a targeted API assertion that verifies
  the server returns `403`.
- Resolved: `docs/manuella-testfall.md` and each companion phase markdown file
  should describe both the browser UI path and the targeted API boundary check
  when both are part of the same negative authorization scenario.
- Resolved: phase tests use the role-specific Playwright `storageState` files
  produced by `tests/integration/global-setup.ts`. The global setup performs a
  real Keycloak login for each role; the phase specs start from those sessions
  and focus on in-app authorization click-through flows.
- Resolved: automated authorization fixtures may remain as uniquely named
  `AUTHZ-*` test data after a run. The seeded dev database reset is the cleanup
  mechanism, and retained fixtures make failed runs easier to inspect.
- Resolved: assignment-based phases do not require generic list filtering for
  every resource type. Kravunderlag phases verify list filtering because the
  implementation filters the specification list by assignment for ordinary
  users. Kravområde and kravpaket phases verify positive mutation on the
  assigned resource and negative mutation or delegation denial where the
  assignment does not grant that permission.
- Resolved: positive UI authorization actions must verify persisted effect, not
  only control visibility. Each positive phase should make a small unique
  change, save it through the UI, and verify the changed value after reload or
  another fresh read.
- Resolved: each phase file may contain multiple focused tests sharing the same
  phase fixture. Keep the phase file as the organizing boundary, but split
  unrelated checks such as positive UI mutation, negative UI denial, and API
  boundary assertions into separate tests for clearer failures.
- Resolved: tests inside a phase file may run serially when they share and
  mutate the same isolated phase fixture. Playwright can still run different
  phase files in parallel.
- Resolved: authorization phase coverage targets desktop only because the
  application is not yet fully designed for mobile use and desktop is the
  primary usage context. This is a deliberate exception to the general
  Playwright viewport guidance. Existing non-authorization tests can continue
  to cover responsive layout for shared surfaces.
- Resolved: authorization phases should not duplicate full feature-test depth
  for surfaces that already have dedicated integration tests. Each phase clicks
  the shortest realistic browser path that proves the relevant authorization
  permission or denial and then verifies persisted effect where the action is
  positive.
- Resolved: every global role and app-owned assignment phase must use a
  distinct person. Do not reuse `cora.coauthor` for both
  kravområdesmedförfattare and kravunderlagsmedförfattare, and do not reuse
  `olle.areaowner` for both kravområdesägare and kravpaketsansvarig. This is
  intended to expose realistic production-code defects that shared identities
  could hide.
- Resolved: add dedicated no-global-role dev users for the separated
  assignment phases:
  - `signe.speccoauthor`, HSA-id `SE5560000001-specco1`, display name
    `Signe SpecCoAuthor`, for kravunderlagsmedförfattare.
  - `leo.pkglead`, HSA-id `SE5560000001-pkglead1`, display name
    `Leo PackageLead`, for kravpaketsansvarig.
- Resolved: the new dedicated test users must be added through the whole
  dev/test identity chain, not only in authorization helpers. Required files
  include the dev Keycloak realm, Playwright global setup and its unit tests,
  Keycloak realm unit tests, OIDC mock users, auth developer documentation,
  manual test cases, and authorization helpers.
- Resolved: kravpaketsansvarig fixtures for `leo.pkglead` should be prepared by
  Admin, not by giving Leo an unrelated kravområde assignment. Admin creates
  the kravpaket, verifies Leo for `requirement_package_lead`, changes
  `leadHsaId` to Leo, and the phase then signs in as Leo to test the pure
  kravpaketsansvarig permissions.
- Resolved: add deterministic seeded `AUTHZ*` authorization demo/test data for
  manual QA and stable read/navigation scenarios, while keeping isolated
  per-run Playwright fixtures for tests that must mutate data to prove positive
  or negative permissions.
- Resolved: classify authorization test data by purpose:
  - Seed-backed data supports reads, list checks, forbidden pages, navigation,
    and manual test cases.
  - Isolated per-run fixtures support automated tests that save, change
    assignments, archive, decide, or attempt forbidden mutations.
  - A phase may use both: seed data for stable navigation and isolated fixtures
    for mutation assertions.
- Resolved: automated authorization tests must not mutate seeded `AUTHZ*` data.
  Do not rely on restore logic after a seeded-object mutation. Use isolated
  per-run fixtures for all automated mutation checks.
- Resolved: implement test identities and deterministic `AUTHZ*` seed data as
  Phase 0 before converting the ten role/assignment phase specs to UI-first
  coverage.
- Resolved: Phase 0 deliverables include new dedicated users, storage states,
  deterministic `AUTHZ*` seed data, documentation updates, authorization helper
  updates, and unit-test acceptance checks for realm, global setup, seed data,
  and manual persona mapping.
- Resolved: rename the old English manual test document to
  `docs/manuella-testfall.md` and write the manual test-case document in
  Swedish. The document must be self-contained for manual targeted and full
  authorization testing.
- Resolved: replace the current `AUTH-11` overview with detailed Swedish
  authorization manual cases grouped by the same phases as the spec files:
  `AUTHZ-00` for test identities and seeded fixtures, followed by `AUTHZ-01`
  through `AUTHZ-10` for the ten role/assignment phases.
- Resolved: update project references to the renamed manual file, including
  `.github/copilot-instructions.md`,
  `.github/instructions/authorization-playwright.instructions.md`, and
  authorization test annotations.
- Resolved: delete the old English manual test document after renaming the
  manual test document. Do not keep a compatibility stub.
- Resolved: when deleting the old English manual test document, carry forward
  existing manual test cases that are not replaced by the new `AUTHZ-*`
  authorization cases. The carried cases must be rewritten in Swedish in
  `docs/manuella-testfall.md` so the manual test suite remains complete.
- Resolved: leave `CONTEXT.md` unchanged for this work. The glossary already
  distinguishes global roles, kravansvarsperson, and kravansvarstilldelning.
  Test persona and seed decisions belong in this working plan, manual cases,
  and test documentation, not in the glossary.
- Resolved: if a planned authorization test exposes a production authorization
  defect, do not change production code and do not add a permanent failing
  Playwright test in the same work. Create a detailed GitHub issue in
  `viscalyx/Kravhantering` with the role/assignment, user, UI steps, expected
  result, actual result, API/server observation where relevant, and the
  Playwright test that should be added when the production defect is fixed.
- Resolved: a production defect in one phase blocks only that affected phase.
  After creating the detailed issue and logging the phase as blocked, continue
  with other independent phases that do not depend on the defect.

## Open Decisions

- None currently.

## Work Log

- 2026-06-13: Read `grill-with-docs`, repository instructions, `CONTEXT.md`,
  `docs/behörigheter.md`, the old English manual test document, existing
  authorization specs, companion phase docs, Playwright global setup, and
  related UI integration tests.
- 2026-06-13: Confirmed the existing authorization coverage is split into ten
  documented phases but is mostly API-driven rather than full click-through UI.
- 2026-06-13: Created this temporary working plan and logged the first open
  design decision.
- 2026-06-13: Resolved the click-through boundary: use UI for user-facing
  authorization flows, with API allowed for fixture setup and API-only security
  boundaries.
- 2026-06-13: Resolved fixture strategy: keep one isolated API-created fixture
  per phase spec, not one shared fixture for all ten phases.
- 2026-06-13: Resolved file strategy: keep one spec per phase and convert those
  specs to UI-first coverage with limited API assertions where the boundary has
  no complete browser UI.
- 2026-06-13: Resolved negative-test strategy: UI proves the user-facing denial
  and targeted API calls prove the server-side authorization boundary.
- 2026-06-13: Resolved documentation strategy: manual cases and phase docs
  describe the UI path and API boundary checks together when both are required
  for a negative scenario.
- 2026-06-13: Resolved login strategy: reuse global-setup role storage states
  instead of repeating a Keycloak click-login inside every phase.
- 2026-06-13: Resolved fixture retention: keep uniquely named `AUTHZ-*`
  fixtures after automated runs and rely on the seeded database reset for
  cleanup.
- 2026-06-13: Resolved list/resource scope: require list filtering only where
  the product model says the list is filtered, especially kravunderlag for
  ordinary users.
- 2026-06-13: Resolved positive-verification depth: positive UI actions must
  prove persisted changes after save/reload or a fresh read.
- 2026-06-13: Resolved test granularity: use multiple focused tests inside a
  phase file when that improves diagnostics, while keeping one file per phase.
- 2026-06-13: Resolved intra-file ordering: keep serial mode where tests in a
  phase share and mutate one fixture.
- 2026-06-13: Resolved viewport scope: authorization phase specs should run
  desktop only. Manual and companion docs need to remove mobile-specific
  expectations from `AUTH-11`.
- 2026-06-13: Resolved feature-depth scope: authorization phases should use the
  shortest realistic UI path that proves the permission or denial, not retest
  every behavior already covered by feature-specific integration specs.
- 2026-06-13: Resolved persona model after user correction: use one specific
  person per global role or kravansvarstilldelning. Current dev fixtures need
  new users for kravunderlagsmedförfattare and kravpaketsansvarig.
- 2026-06-13: Resolved new test identities: use `signe.speccoauthor` for
  kravunderlagsmedförfattare and `leo.pkglead` for kravpaketsansvarig.
- 2026-06-13: Resolved identity propagation: add the new users to the complete
  dev/test identity chain and matching documentation.
- 2026-06-13: Resolved package-lead fixture setup: prepare Leo's package with
  Admin so Leo remains a pure kravpaketsansvarig persona.
- 2026-06-13: Resolved seed strategy: add deterministic `AUTHZ*` seed data for
  manual tests and stable read/navigation scenarios, but create isolated
  fixtures inside Playwright tests whenever mutation is required to prove
  authorization behavior.
- 2026-06-13: Resolved data classification: seed-backed for stable/manual
  checks, isolated per-run fixtures for automated mutation checks, and both
  where a phase benefits from stable navigation plus isolated mutation.
- 2026-06-13: Resolved seeded data mutation rule: automated authorization tests
  must not mutate seeded `AUTHZ*` data.
- 2026-06-13: Resolved phase order: add a Phase 0 for test identities and
  deterministic `AUTHZ*` seed data before implementing the ten UI-first
  role/assignment phases.
- 2026-06-13: Resolved Phase 0 scope and acceptance checks.
- 2026-06-13: Confirmed no `CONTEXT.md` glossary update is needed for the test
  strategy.
- 2026-06-13: Resolved production defect handling: create a detailed GitHub
  issue and leave production-code changes plus the corresponding permanent
  Playwright test to a fresh session.
- 2026-06-13: Resolved blocked-phase handling: continue independent phases
  after logging a production defect and creating the corresponding issue.
- 2026-06-13: User corrected manual documentation scope:
  the manual test document must contain the detailed human-executable
  authorization test steps per role/assignment phase, with a table of contents.
  It is used for targeted or full manual testing when integration tests cannot
  run.
- 2026-06-13: Resolved manual file language and name: rename the old English
  manual test document to `docs/manuella-testfall.md`, write it in Swedish, and
  use `AUTHZ-00` through `AUTHZ-10` for the detailed authorization phase cases.
- 2026-06-13: Resolved rename cleanup: delete the old English manual test
  document and update references instead of keeping a compatibility stub.
- 2026-06-13: User corrected rename cleanup: keep the old file deleted, but
  move existing manual cases that are not replaced by the new authorization
  cases into `docs/manuella-testfall.md` and rewrite them in Swedish.
- 2026-06-13: Started Phase 0 implementation by adding dedicated storage states
  and identities for `signe.speccoauthor` and `leo.pkglead`.
- 2026-06-13: Added deterministic AUTHZ seed rows for kravområde,
  kravunderlag, and kravpaket, plus a unit test protecting those rows.
- 2026-06-13: Ran targeted Phase 0 unit tests:
  `npm test -- --run tests/unit/playwright-global-setup.test.ts
  tests/unit/keycloak-realm.test.ts tests/unit/seed-database.test.ts`.
  Result: passed, 31 tests.
- 2026-06-13: Ran authorization Playwright suite after rebuilding local
  Keycloak/HSA test infrastructure. Found production defect: requirement area
  co-authors cannot create requirements in assigned areas because
  `POST /api/requirements` authorization lacks `areaId`. Created
  [issue #321](https://github.com/viscalyx/Kravhantering/issues/321) and
  marked that positive phase-3 check as `fixme`.
- 2026-06-13: Re-ran `npx playwright test 'tests/integration/authorization'
  --workers=1`. Result: passed with 14 tests and 1 expected `fixme` for issue
  #321.
