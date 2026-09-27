---
name: implement-batch
description: "Implement a spec by orchestrating its dependency-ordered tickets."
argument-hint: "<spec issue number or URL>"
disable-model-invocation: true
---

# Implement Batch

Orchestrate a **Spec** and its sub-issues to completion on the current branch. The
**Spec** is the parent issue; leave it open.

## Process

### 1. Establish the integration boundary

- Resolve the **Spec**, current branch, and current `HEAD`.
- Stop on a detached `HEAD` or a dirty worktree; ask the user how to proceed.
- Record the starting commit as the fixed point for the final review.

Completion criterion: the integration branch is clean and the fixed point is
an immutable commit.

### 2. Claim and map the work

- Assign the **Spec** to the authenticated tracker user before implementation work.
- Read the **Spec** body, comments, open sub-issues, and blocking relationships.
- Build a dependency graph containing every open sub-issue. A sub-issue is on
  the frontier only when all its blockers are closed.
- If the tracker does not yield an unambiguous graph, ask the user before
  dispatching work.

If the **Spec** has no sub-issues, call the Skill tool with "implement" for the
**Spec** on the current branch, then continue at step 5.

Completion criterion: every open sub-issue is in the graph with a known set of
blockers, and the current frontier is explicit.

### 3. Dispatch the frontier

For each frontier sub-issue:

1. Assign it to the authenticated tracker user.
2. Start one new background agent in its own worktree under the environment's
   designated temporary worktree root outside the primary checkout, based on
   the current integration `HEAD`.
3. Give the agent both the **Spec** and sub-issue references. Require it to call the
   Skill tool with "implement", commit its work, and return its branch, commit range,
   summary, and verification results. Keep tracker comments and issue closure with the
   orchestrator.

Run independent frontier work in parallel up to the available agent capacity;
queue the remainder. Answer agent questions from the **Spec**, issue discussion,
and repository. Bring questions requiring a product or scope decision to the
user.

Completion criterion: every dispatched sub-issue returns committed work and
verification evidence, or a concrete blocker remains visible and the issue
stays open.

### 4. Integrate, verify, and advance

For each completed sub-issue:

1. Inspect its commits and diff against the sub-issue acceptance criteria.
2. Cherry-pick its returned commits onto the integration branch in dependency
   order. Resolve conflicts without discarding accepted work already
   integrated.
3. Run the checks affected by the combined result.
4. After the work and checks pass, comment on both the sub-issue and the **Spec**
   with the summary, verification results, and integrated commit reference.
5. Close the sub-issue.

Refresh the tracker relationships after each wave, then dispatch the newly
unblocked frontier. If open sub-issues remain but the frontier is empty, report
the cycle or external blocker and ask the user for direction.

Completion criterion: every sub-issue is closed, every accepted commit is on
the integration branch, and no sub-issue was closed before its integrated work
passed verification.

### 5. Review the integrated result

- Run the repository's full required checks on the integration branch.
- Call the Skill tool with "code-review" with the recorded starting commit as the fixed point
  and the **Spec** as the spec source.
- For each actionable finding, dispatch a repair agent from the current
  integration `HEAD` in a fresh worktree under the environment's designated
  temporary worktree root outside the primary checkout. Give it the finding and
  relevant issue context, require call the Skill tool with "implement", then
  integrate and verify its commit.
- Repeat the full checks and call the Skill tool with "code-review" after each
  repair wave until both the Standards and Spec axes have no unresolved findings.
- Count a finding as resolved only when it is fixed or shown not to violate the
  cited **Spec** or repository standard.
- Record repair summaries and commit references on the **Spec** and any affected
  sub-issue.

Completion criterion: the full checks pass, both review axes have no unresolved
findings, all sub-issues remain closed, and the **Spec** remains open.
