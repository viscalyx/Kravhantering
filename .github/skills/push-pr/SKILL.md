---
name: push-pr
description: Push the current branch to `my` and open a pull request against `origin`.
argument-hint: "[PR title or related issue]"
disable-model-invocation: true
---

# Push PR

1. Resolve the current branch, both remote repositories, and `origin`'s default
   branch. Stop on a detached HEAD or the default branch.
2. Review `origin/<default>...HEAD` and push with `git push -u my HEAD`.
3. Populate `.github/pull_request_template.md` from the changes. Preserve its
   markers and complete required sections honestly. Use /operator-upgrade-notes for operator notes
4. Create the PR with `gh pr create`, targeting `origin`'s repository and default
   branch from `<my-owner>:<current-branch>`. Use the populated template as the
   body. Use an argument as title or issue context when supplied.
5. Return the PR URL.
