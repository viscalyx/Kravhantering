---
name: implement-stack
description: "Implement a spec by orchestrating its dependency-ordered tickets into a GitHub PR stack."
argument-hint: "<spec issue number or URL>"
disable-model-invocation: true
---

# Implement Stack

Orchestrate a **Spec** and its sub-issues to completion as a GitHub PR stack.
The **Spec** is the parent issue; leave it open. Publish ready PRs; never merge,
enable auto-merge, or enter a merge queue.

## Process

### 1. Establish the stack boundary

- Resolve the **Spec**, repository, and target branch (`main` by default).
- Check [prerequisites](references/git-and-publication.md#prerequisites) and
  establish [ownership and the journal](references/state-and-recovery.md#journal-and-ownership).
- Fetch the target. Record the starting commit in the journal as an immutable
  record and the initial verified tip.

Completion criterion: stack prerequisites are met, ownership is established,
and the starting commit is recorded immutably.

### 2. Claim and map the work

- Assign the **Spec** to the authenticated tracker user before implementation work.
- Read the **Spec** body, comments, open sub-issues, and blocking relationships.
- Build a dependency graph containing every open sub-issue. A sub-issue is on
  the frontier only when all its blockers are closed.
  Results accepted during this batch must also be present in the verified tip.
- If the tracker does not yield an unambiguous graph, ask the user before
  dispatching work.

If the **Spec** has no sub-issues, treat it as the single work item in steps
3–4, keeping it open.

Completion criterion: every open sub-issue is in the graph with a known set of
blockers, and the current frontier is explicit.

### 3. Dispatch the frontier

Every dispatched agent gets a base commit: the verified stack tip at dispatch.
Give the agent that commit and require it to start its branch there.

For each frontier sub-issue:

1. Assign it to the authenticated tracker user.
2. Start one new background agent in its own worktree.
3. Give the agent both the **Spec** and sub-issue references. Require it to
   call the Skill tool with "implement", commit its work, and return its branch,
   commit range, summary, and verification results. Keep tracker comments and
   issue closure with the orchestrator, along with stack operations and
   publication.
4. Require the agent to stop background processes and explicitly hand back
   its clean worktree. Keep active worker branches outside the stack.

Run independent frontier work in parallel up to the available agent capacity;
queue the remaining frontier issues. When nested reviews lack slots, use
[queued reviews](references/state-and-recovery.md#queued-reviews) instead of
reserving idle reviewer slots during implementation. Answer agent questions
from the **Spec**, issue discussion, and repository. Bring questions requiring
a product or scope decision to the user.

Completion criterion: every dispatched sub-issue returns committed work on its
base commit and verification evidence, or a concrete blocker remains visible
and the issue stays open.

### 4. Integrate, verify, and advance

For each completed sub-issue:

1. Inspect its commits and diff against the sub-issue acceptance criteria.
2. After handoff, [adopt and rebase](references/git-and-publication.md#adopt-and-integrate)
   its branch into the stack in dependency order. Resolve conflicts without
   discarding accepted work already integrated.
3. Call the Skill tool with "select-integration-tests" for the combined
   result before running checks. Execute its required integration scenarios
   alongside other affected checks, then call the Skill tool with
   "select-integration-tests" again with the results to assess verification
   status.
4. After the work and checks pass and integration verification is complete,
   advance the verified tip and comment on both the sub-issue and the **Spec**
   with the summary, verification results, and integrated commit reference.
5. Close the sub-issue.

Refresh the tracker relationships after each integration, then dispatch the newly
unblocked frontier. If open sub-issues remain but the frontier is empty, report
the cycle or external blocker and ask the user for direction.

For conflicts, failed checks, or interruptions, follow
[State and recovery](references/state-and-recovery.md).

Completion criterion: every sub-issue is closed, every accepted change is in
the stack, and no sub-issue was closed before its integrated work passed
verification.

### 5. Review the integrated result

- Refresh the target; follow [Target movement](references/git-and-publication.md#target-movement)
  if it changed. Verify the combined result through step 4's checks.
- From the last branch in the stack, call the Skill tool with "code-review"
  with the refreshed target commit as the fixed point and the **Spec** as
  the spec source.
- For each actionable finding, dispatch a repair agent in a fresh worktree on a
  new base commit. Give it the finding and relevant issue context, require it to
  call the Skill tool with "implement", then integrate and verify its commit.
  Append a new layer unless [a failing earlier layer needs repair](references/state-and-recovery.md#repair-a-failing-layer).
- Verify each repair wave through step 4's checks, and call the Skill tool
  with "code-review" until both the Standards and Spec axes have no
  unresolved findings.
- Count a finding as resolved only when it is fixed or shown not to violate the
  cited **Spec** or repository standard.
- Record repair summaries and commit references on the **Spec** and any affected
  sub-issue.

Completion criterion: required checks have valid passing evidence, both review
axes have no unresolved findings, all sub-issues remain closed, and the **Spec**
remains open.

### 6. Publish and hand off

- Call the Skill tool with "operator-upgrade-notes" for each layer's diff.
  Integrate and review any required changes through steps 4–5.
- Follow [publication](references/git-and-publication.md#publish) to create
  and verify one ready PR per nonempty layer in a native GitHub stack.
- Record the ordered PR links, starting commit, reviewed target and layer commits,
  verification, review results, and journal location on the **Spec**.
- Follow [retention and manual cleanup](references/journal-lifecycle.md#retention-and-manual-cleanup)
  when releasing the writer claim and reporting the journal location.
  Leave the **Spec** open for the separate merge workflow.
- Prepare the development handoff from the final verified head, including
  repair layers. Inspect `git worktree list --porcelain`, the selected directory's
  HEAD and working-tree status. Prefer running in its existing worktree; any
  checkout must respect branch ownership and preserve uncommitted changes.
  Account for local changes before describing the directory as the verified
  result. Locate it independently of the journal's storage location.
- Derive required preparation and launch commands from that revision's
  `package.json`, development scripts and environment configuration.
  Check dependencies and available private configuration without exposing
  secrets. When ignored configuration is absent from the selected worktree,
  locate the existing file and export its absolute path through
  `SKYTTEL_DEV_ENV_FILE` (or the revision's equivalent) before every command
  sequence, including separately offered setup. Respect exported environment
  precedence; resolve relative configuration and data paths against the intended
  working directory so changing directories preserves the selected data.
- Use existing data by default. Separate required preparation from optional
  reset or seeding; include reset commands only when requested. Explain their
  data and session deletion effects and confirm the selected database path.
  Check startup's migration behavior before adding a separate migration step.
- Validate head, paths, configuration scope, command availability and data
  preservation for both the main workspace with local configuration and a
  separate worktree with configuration elsewhere. Use read-only checks for
  user data; distinguish static validation, executed commands, application
  launch and browser verification in the report.
- Return the PR stack, outstanding human approvals and the PR/branch and commit
  containing the complete result. End the response with a copyable shell
  sequence using actual, safely quoted paths and applicable repository commands.
  Include the browser URL or port-forwarding step and shutdown instructions
  immediately before it or as shell comments. State any missing configuration
  or prerequisite and the user action needed before launch; claim a working
  launch only when verified.

Completion criterion: publication checks pass for every intended PR, and the
final response identifies the complete head and ends with validated launch
instructions or explicit prerequisites blocking them. One layer yields one
ordinary PR; an already satisfied Spec needs no artificial changes.
