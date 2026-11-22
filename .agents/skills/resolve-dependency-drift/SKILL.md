---
name: resolve-dependency-drift
description: Resolve a reported dependency maintenance drift across the project.
disable-model-invocation: true
---

# Resolve Dependency Drift

1. Read the supplied issue or report. Identify the maintenance unit, current
   and available versions, completion criteria, and scope. Discover the
   project's update policy, canonical definitions, automation, and consumers;
   treat the report's file list as a starting point, not a complete inventory.
2. For container image drift, carry forward the image, reported candidate,
   constraints, and completion criteria.
   Call the Skill tool with "update-container-image".
   Use its workflow to select, apply, and verify the update, then go to step 4.
3. For other dependencies, research the candidate with primary upstream
   sources. Establish its supported version lane, compatibility, required
   identities, and migration or security changes. Update the named unit and
   its consumers, locks, installers, fixtures, and active examples. Update
   affected tests and guidance and run the relevant project checks.
4. Compare the result with the report's completion criteria. Run a read-only
   drift check when available. Report changed consumers, verification evidence,
   and remaining drift or verification gaps.

Inspect automation before running it; a detector can also modify remote issues
or branches. Keep research artifacts outside the repository unless requested.
