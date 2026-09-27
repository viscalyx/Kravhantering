---
name: maintain-manual-tests
description: >-
  Maintain manual cases and their Playwright integration tests. Use when
  adding, changing, moving, renaming, or removing manual cases or integration
  tests; maintaining the manual-test index; or editing the testing guide.
---

# Maintain Manual Tests

## Workflow

For index-only or testing-guide-only work, use steps 5 and 6.

1. Identify the requested scenarios, accepted requirements, affected specs,
   and existing cases under `docs/manual-tests/`. Derive expected behavior
   from the requirements. Apply this workflow to scenarios in scope;
   backfill unrelated existing scenarios only when requested.
2. Classify each change. Synchronize functional scenario additions, changes,
   and removals with matching manual cases and Playwright coverage in the
   same change. Allow selector, flake, title, setup, and refactoring
   maintenance without production changes when behavior and coverage remain
   intact; update manual cases only when instructions or references change.
   Keep production fixes within authorized requirements and preserve valid
   assertions when a test exposes a defect.
3. For case additions or revisions, read
   [the area template](templates/area.md). Use its full structure for a new
   area file; reuse its case section within an existing area. Replace every
   placeholder with runnable Swedish instructions and observable results.
   Resolve template links from the destination file under
   `docs/manual-tests/`.
   Keep cases focused on functional workflows and user-observable
   accessibility; cover pixel measurements, target geometry, and visual
   layout with automated checks.
4. Complete the mapping for each affected functional scenario. Link each
   manual case to its spec and exact scenario title; include the case ID in
   each matching Playwright title. Verify that automated assertions cover
   the same expected behavior. Isolated fixtures may differ from manual
   data when they exercise equivalent roles, state, and access boundaries.
   Preserve stable IDs when renaming or moving cases, update affected links
   and title references together, and retire removed IDs without reuse.
5. Group cases by application area, independent of demo fixtures or individual
   pages. Maintain `docs/manual-tests/README.md` as the area index; update its
   links and summaries whenever area files or their documented coverage
   change. Keep application test steps in manual cases. Keep
   `docs/development/testing.md` focused on test execution, without links to
   manual cases or their index.
6. Validate changed documents with the repository's Markdown and spelling
   checks, including new files outside the configured check list. Resolve
   local links and verify that referenced titles and IDs match the specs.
   For changes to test behavior or execution, run the affected integration
   tests using the repository's test guidance. For title-only changes, verify test
   discovery. Report updated cases, checks performed, and any remaining
   coverage gaps; report manual execution only when actually performed.
