---
name: implement-batch
description: "Implement a spec by orchestrating its dependency-ordered tickets."
argument-hint: "<spec issue number or URL>"
disable-model-invocation: true
---

# Implement Batch

Orchestrate a **Spec** and its sub-issues to completion on a local integration
branch in the primary checkout. The **Spec** is the parent issue; leave it open.

Stay in the primary checkout for the whole run; the orchestrator never enters a
worktree. Only dispatched agents work in worktrees. Address each agent worktree
by its absolute path (`git -C <worktree> ...`).

## Process

### 1. Establish the integration boundary

- Resolve the **Spec**, current branch, and current `HEAD` of the primary
  checkout.
- Stop on a detached `HEAD` or a dirty checkout; ask the user how to proceed.
- Create and switch to the local integration branch from the current `HEAD`:
  `git switch -c f/issue-<spec-number>`. If that branch already exists, ask the
  user whether to resume on it.
- Record the starting commit as the fixed point for the final review. On
  resume, use the commit the integration branch was created from.
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
2. Create its worktree yourself from the current integration `HEAD` under the
   environment's designated worktree root outside the primary checkout:
   `git worktree add <root>/<slug> -b <branch> HEAD`. Built-in agent worktree
   isolation can branch from the default branch and nest the worktree inside
   the primary checkout. The orchestrator does not enter the new worktree.
3. Start one new background agent with that worktree's absolute path as its
   working copy, and give it both the **Spec** and sub-issue references.
   Require it to read, edit, and run commands inside that path, call the Skill
   tool with "implement", commit its work, and return its branch, commit
   range, summary, and verification results. The agent may edit inside the
   linked worktree without entering it. Keep tracker comments and issue
   closure with the orchestrator.

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
2. Cherry-pick its returned commits onto `f/issue-<spec-number>` in the
   primary checkout, in dependency order. Resolve conflicts in place without
   discarding accepted work already integrated. If a conflict cannot be
   resolved in place, run `git cherry-pick --abort`, have the sub-issue's
   agent rebase its branch onto the current integration `HEAD` in its
   worktree, then cherry-pick the rebased commits.
3. Run the checks affected by the combined result.
4. After the work and checks pass, comment on both the sub-issue and the **Spec**
   with the summary, verification results, and integrated commit reference.
5. Close the sub-issue.
6. Remove its worktree and delete its branch:
   `git worktree remove <worktree>` and `git branch -D <branch>`. Worktrees
   accumulate on the separate disk.

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
- For each actionable finding, dispatch a repair agent under the worktree
  rules of steps 3 and 4: create a fresh worktree from the current
  integration `HEAD`, give the agent the finding and relevant issue context,
  and require it to call the Skill tool with "implement". Cherry-pick and
  verify its commit, then remove its worktree and branch.
- Repeat the full checks and call the Skill tool with "code-review" after each
  repair wave until both the Standards and Spec axes have no unresolved findings.
- Count a finding as resolved only when it is fixed or shown not to violate the
  cited **Spec** or repository standard.
- Record repair summaries and commit references on the **Spec** and any affected
  sub-issue.

Completion criterion: the full checks pass, both review axes have no unresolved
findings, all sub-issues remain closed, and the **Spec** remains open.
