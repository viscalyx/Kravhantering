---
name: push-pr
description: Push the current branch to `my` and open a pull request against `origin`.
argument-hint: "[PR title or related issue]"
disable-model-invocation: true
---

# Push PR

1. Resolve the current branch, both remote repositories, and `origin`'s default
   branch. Stop on a detached HEAD or the default branch.
2. Fetch the resolved default branch with `git fetch origin <default>`, then
   stop if `git status --porcelain` reports changes. Only after both gates pass,
   review the refreshed `origin/<default>...HEAD` and push with
   `git push -u my HEAD`.
3. Populate `.github/pull_request_template.md` from the changes. Preserve its
   markers and complete required sections honestly. Use /operator-upgrade-notes for operator notes
4. Create the PR with `gh pr create --repo <origin-owner>/<origin-repo> --base
   <default> --head <my-owner>:<current-branch>`, using the validated `origin`
   repository, its default branch, and the populated template body. Use an
   argument as title or issue context when supplied.
5. Return the PR URL.
