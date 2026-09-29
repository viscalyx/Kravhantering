---
name: implement-batch
description: "Implement a spec by orchestrating its dependency-ordered tickets."
argument-hint: "<spec issue number or URL>"
disable-model-invocation: true
---

# Implement Batch

Orchestrate a **Spec** and its sub-issues to completion on a local integration
branch in the primary checkout. The **Spec** is the parent issue; leave it open.

Stay in the primary checkout for the whole run and never enter a worktree;
reach agent worktrees only by absolute path.

## Process

### 1. Establish the integration boundary

- Stop on a detached `HEAD` or a dirty checkout; ask the user how to proceed.
- Create the local integration branch `f/issue-<spec-number>` from the current
  `HEAD`. If it already exists, ask the user whether to resume on it and, if
  so, for its starting commit.
- Record the starting commit as the fixed point for the final review.
- Keep the integration branch local unless the user asks to push it.

Completion criterion: the primary checkout is on a clean integration branch and
the fixed point is an immutable commit.

### 2. Claim and map the work

- Assign the **Spec** to the authenticated tracker user before implementation work.
- Read the **Spec** body, comments, open sub-issues, and blocking relationships.
- Build a dependency graph containing every open sub-issue. A sub-issue is on
  the frontier only when all its blockers are closed.
- If the tracker does not yield an unambiguous graph, ask the user before
  dispatching work.

If the **Spec** has no sub-issues, call the Skill tool with "implement" for the
**Spec** on the integration branch, then continue at step 5.

Completion criterion: every open sub-issue is in the graph with a known set of
blockers, and the current frontier is explicit.

### 3. Dispatch the frontier

For each frontier sub-issue:

1. Assign it to the authenticated tracker user.
2. Start one new background agent with `isolation: "worktree"`, and give it
   both the **Spec** and sub-issue references. The project's `WorktreeCreate`
   hook branches that worktree from the primary checkout's current `HEAD`, so
   the agent starts from everything integrated so far.
3. Require the agent to call the Skill tool with "implement", commit its work,
   and return its commit range, summary, and verification results. Keep
   tracker comments and issue closure with the orchestrator.

Run independent frontier work in parallel up to the available agent capacity;
queue the remainder. Run frontier sub-issues that will clearly touch the same
files one after another. Answer agent questions from the **Spec**, issue
discussion, and repository. Bring questions requiring a product or scope
decision to the user.

Completion criterion: every dispatched sub-issue returns committed work and
verification evidence, or a concrete blocker remains visible and the issue
stays open.

### 4. Integrate, verify, and advance

For each completed sub-issue:

1. Inspect its commits and diff against the sub-issue acceptance criteria.
2. Cherry-pick its commits onto the integration branch in dependency order.
   Resolve conflicts in place without discarding accepted work already
   integrated. When a conflict needs the sub-issue's context, abort and have
   the work rebuilt on the current integration `HEAD`, preferably by
   continuing the sub-issue's agent, otherwise by a new agent as in step 3.
   Then integrate the rebuilt branch.
3. Run the checks affected by the combined result.
4. After the work and checks pass, comment on both the sub-issue and the **Spec**
   with the summary, verification results, and integrated commit reference.
5. Close the sub-issue.
6. Remove every worktree and branch created for it; Claude Code leaves
   hook-created worktrees in place.

Refresh the tracker relationships after each wave, then dispatch the newly
unblocked frontier. If open sub-issues remain but the frontier is empty, report
the cycle or external blocker and ask the user for direction.

Completion criterion: every sub-issue is closed, every accepted commit is on
the integration branch, no sub-issue was closed before its integrated work
passed verification, and no closed sub-issue keeps a worktree or branch.

### 5. Review the integrated result

- Run the repository's full required checks on the integration branch.
- Call the Skill tool with "code-review" with the recorded starting commit as
  the fixed point and the **Spec** as the spec source.
- For each actionable finding, dispatch a repair agent into a fresh worktree
  as in step 3, with the finding and relevant issue context instead of a
  sub-issue. Integrate, verify, and clean up its work as in step 4.
- Repeat the full checks and call the Skill tool with "code-review" after each
  repair wave until both the Standards and Spec axes have no unresolved findings.
- Count a finding as resolved only when it is fixed or shown not to violate the
  cited **Spec** or repository standard.
- Record repair summaries and commit references on the **Spec** and any affected
  sub-issue.

Completion criterion: the full checks pass, both review axes have no unresolved
findings, no repair worktree or branch remains, all sub-issues remain closed,
and the **Spec** remains open.
