---
name: maintain-manual-tests
description: >-
  Maintain manual cases, functional counterparts, and mapped evidence. Use
  when planning or changing manual cases, integration or browser counterparts,
  or mapped technical evidence, or when maintaining a test index or guide.
---

# Maintain Manual Tests

## Workflow

1. Take the case locations, language, index, test suites, mapping format, and
   validation commands from the user's request and project instructions.
   Infer missing conventions from existing cases and test configuration.
   Ask which convention to use when the available sources leave a choice
   that would change the work. For index or guide edits, continue at step 5.
   Otherwise, identify the requested scenarios, expected outcomes, and
   affected specs.
   Use [test placement](references/cases.md#test-placement) to choose the suite.
   Backfill unrelated scenarios only when requested.
2. Classify each change. Synchronize functional scenario additions, changes,
   and removals with matching manual cases and functional coverage in the
   same change. Allow selector, flake, title, setup, and refactoring
   maintenance without production changes when behavior and coverage remain
   intact. Update manual cases when instructions or references change.
   Keep production fixes within authorized requirements and preserve valid
   assertions when a test exposes a defect.
3. For case additions or revisions, read
   [case writing](references/cases.md#case-writing) and
   [the area template](templates/area.md). Use the full template for a new
   area or its case section within an existing area. Adapt it to the project's
   language and format. Replace placeholders with runnable instructions and
   observable results.
4. For changed cases, counterparts, or evidence, apply
   [mapping and identity](references/cases.md#mapping-and-identity). Use the
   project's format to identify the functional counterpart or state what a
   human must observe. Record supporting evidence separately. Compare the
   counterpart's actions and assertions with the manual case.
5. Group cases by application area. Update the project’s test index when
   area files or their coverage change. Keep application procedures in the
   cases and test execution instructions in the testing guide.
6. Run the project's documentation checks and resolve local links. For
   mapping, evidence, or identity changes, run the configured mapping check
   when available. During a staged migration, validate all affected areas,
   then run the full check before completing the migration. For behavior or
   execution changes, run the affected suites. For title-only changes, verify
   discovery. Report updated cases, checks, and coverage gaps. Report manual
   execution only when performed.
