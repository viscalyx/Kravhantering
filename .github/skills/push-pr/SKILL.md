---
name: push-pr
description: Push the current branch to `my` and open a pull request against `origin`.
argument-hint: "[PR title or related issue]"
disable-model-invocation: true
---

# Push PR

Publication-only workflow. Treat the current committed branch as the artifact
to publish.
Do not run repository validation commands: tests, linters, type checks, or builds.
Allow Git and GitHub inspection, including PR-body verification with `gh pr view`.

1. Resolve the current branch, both remote repositories, and `origin`'s default
   branch. Stop on a detached HEAD or the default branch.
2. Fetch the resolved default branch with `git fetch origin <default>`, then
   stop if `git status --porcelain` reports changes. Only after both gates pass,
   review the refreshed `origin/<default>...HEAD` and push with
   `git push -u my HEAD`.
3. Populate the PR body from `.github/pull_request_template.md`. For Operator
   Upgrade Impact, inspect the committed diff for
   `docs/operations/operator-upgrade-notes.md` in `origin/<default>...HEAD`.
   Check exactly one declaration: `Operator notes updated` when that diff
   contains a meaningful addition or correction under `## Unreleased`;
   otherwise, `No operator notes needed`, without justification. Count only
   guidance committed on the branch being pushed; formatting, source-marker,
   removal-only, or release-history changes do not qualify as updated notes.
   Preserve template markers and complete the remaining sections honestly.
4. Create the PR with `gh pr create --repo <origin-owner>/<origin-repo> --base
   <default> --head <my-owner>:<current-branch>`, using the validated `origin`
   repository, its default branch, and the populated template body. Use an
   argument as title or issue context when supplied.
5. Return the PR URL.
