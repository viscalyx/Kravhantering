---
name: push-pr
description: Push the current branch to `my` and open a pull request against `origin`.
argument-hint: "[PR title or related issue]"
disable-model-invocation: true
---

# Push PR

Publish the current committed branch, adding required operator guidance when
the pre-publication assessment identifies a gap.
Do not run repository validation commands: tests, linters, type checks, or builds.
Allow Git and GitHub inspection, including PR-body verification with `gh pr view`.

1. Resolve the current branch, both remote repositories, and `origin`'s default
   branch. Stop on a detached HEAD or the default branch.
2. Fetch the resolved default branch with `git fetch origin <default>`, then
   stop if `git status --porcelain` reports changes.
3. Before pushing, inspect the committed diff for
   `docs/operations/operator-upgrade-notes.md` in `origin/<default>...HEAD`.
   A meaningful addition or correction under `## Unreleased` qualifies as
   updated notes. Formatting, source-marker, removal-only, and release-history
   changes do not qualify.
   If no qualifying guidance is committed, invoke the Skill tool with "operator-upgrade-notes" for the complete
   committed diff against the refreshed `origin/<default>`, including adjacent
   code needed for the assessment. An absent notes diff is not a no-notes
   decision. If guidance is required, have the skill write it, review the
   resulting diff, and commit only the required notes before continuing.
   Complete this step with either qualifying committed guidance or an explicit
   no-notes result for the exact source changes being published. Reassess if
   those source changes change before publication.
4. Verify the worktree is clean and push with `git push -u my HEAD`. Populate
   the PR body from `.github/pull_request_template.md`. For Operator Upgrade
   Impact, check exactly one declaration: `Operator notes updated` for the
   qualifying committed guidance, or `No operator notes needed` for the skill's
   explicit no-notes result.
   Preserve template markers and complete the remaining sections honestly.
5. Create the PR with `gh pr create --repo <origin-owner>/<origin-repo> --base
   <default> --head <my-owner>:<current-branch>`, using the validated `origin`
   repository, its default branch, and the populated template body. Use an
   argument as title or issue context when supplied.
6. Return the PR URL.
