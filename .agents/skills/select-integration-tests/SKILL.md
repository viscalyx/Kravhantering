---
name: select-integration-tests
description: >-
  Determine which integration scenarios and runtime variants a change affects,
  which passing results remain valid, and which commands to run. Use before
  running integration tests, after implementation or test fixes, and when
  verifying merged or cherry-picked work.
---

# Select Integration Tests

Produce a test selection for the calling workflow to execute. Apply this
workflow to local verification; preserve CI's configured test scope.

## Workflow

### 1. Establish scope

- Identify the current task's starting commit or supplied comparison point
  for branch or PR work. Inspect the cumulative diff, including committed,
  staged, unstaged and new files, rather than only the latest edit.
- Include user-requested spec paths, scenarios and reported failures as
  selection inputs. For a test-repair request without code changes, use
  those inputs as the initial scope.
- Read repository npm scripts, runner configuration and test-environment scripts
  to identify supported spec filters and runtime variants.

### 2. Trace impact

- Select new and changed integration scenarios and every existing scenario
  whose observable behavior could change through affected routes, callers,
  dependencies, configuration or shared test helpers. Trace these paths
  beyond edited specs and matching filenames.
- For shared infrastructure, trace affected contracts to their consumers.
  Cover each affected behavior and failure path. Shared startup or a shared
  helper alone does not make every scenario affected.
- Select runtime variants whose behavior could be affected, plus explicitly
  requested variants. Include prodlike when requested or relevant to the
  change, using the repository's supported configuration.
- Run the full integration suite only when the user explicitly requests
  that scope. General implementation or verification requests and skill
  instructions to run all checks do not authorize that expansion.
- Resolve uncertainty by inspecting dependency paths. Report any remaining
  coverage gap rather than defaulting to the full suite.

### 3. Reassess earlier results

- Track scenarios, commands, runtime variants, results and the code and
  configuration tested. Preserve completed results from partial runs;
  record interrupted and unexecuted scenarios separately.
- For intermittent failures, preserve stable test identity, original and later
  execution IDs, commit/dirty state, command/selection, runtime/fonts, tool
  versions, order/seed, outcomes and retained artifact references. Mark missing
  context unavailable. Keep facts, hypotheses and confirmed causes distinct.
- Select each reproduction from an explicit hypothesis, finite attempt budget
  and stop condition. Record its result and next step at the limit. Reuse valid
  passing verification without treating it as a confirmed cause or repair;
  retain unresolved follow-up independently of verification status.
- After every change, invalidate earlier passes for every affected scenario.
  Include implementation, test, helper, dependency and runtime configuration
  changes. Expected behavior preservation is not evidence of a valid pass;
  if a scenario could be affected, select it for rerunning.
- Treat merges, cherry-picks and conflict resolutions as changes. Assess the
  combined result even when tests passed on a contributing branch.
- Reuse a passing result only when the scenario and runtime are demonstrably
  unaffected by every subsequent change. Committing or reviewing unchanged
  code does not invalidate a result.
- After a fix, select failing scenarios and all scenarios affected by the
  fix, including previously passing tests. Exclude from execution only
  scenarios with valid passing evidence.

### 4. Return the selection

- List spec paths or title filters, runtime variants, affected behaviors
  and reasons for selection. Separate tests to run from valid reused results.
- Provide exact repository npm commands with explicit spec paths and useful
  title filters. Inspect composite scripts for unintended full-suite runs;
  split applicable build, unit and selected integration steps as needed.
- Account for every changed behavior with selected coverage or a specific
  gap. If no integration behavior can change, state why and return an empty
  integration selection, leaving applicable non-integration checks to the
  calling workflow.

### 5. Assess verification evidence

- When execution results or further changes are available, update the
  selection and evidence using steps 2-4.
- Verification is complete when every selected scenario has passed after
  its latest affecting change. Report specific failures or coverage gaps
  when that criterion is unmet.
- Return commands, reused results and untested scope for the calling
  workflow's final report. Describe only the scope actually verified.
  Require another run only for missing or invalidated passing evidence.
- Report unresolved intermittent investigations alongside verification results,
  including their evidence record and next step. A later pass neither erases
  their failure evidence nor requires unrelated passing scenarios to rerun.
