---
name: push-pr
description: Push the current branch to `my` and open a pull request against `origin`.
argument-hint: "[PR title or related issue]"
disable-model-invocation: true
---

# Push PR

Publish the current branch. Assess committed operator guidance before pushing.
Do not run repository validation commands: tests, linters, type checks, or builds.
Allow Git and GitHub inspection, including PR-body verification with `gh pr view`.

1. Resolve the current branch, both remote repositories, and `origin`'s default
   branch. Stop on a detached HEAD or the default branch.
2. Fetch the resolved default branch with `git fetch origin <default>`. Stop
   if the working tree has unrelated uncommitted changes.
3. Use /operator-upgrade-notes on `origin/<default>...HEAD`. If required
   committed guidance is missing, show the exact proposed Unreleased text and
   ask before adding and committing it. Approval authorizes that commit.
   Declining required guidance stops the push. A user no-notes determination
   or adequate committed guidance permits progress without another prompt.
4. Populate `.github/pull_request_template.md`. Select exactly one operator
   declaration and complete the remaining required sections honestly. Keep
   guidance in the committed notes document.
5. Require a clean working tree, then push with `git push -u my HEAD`.
6. Create the PR with `gh pr create --repo <origin-owner>/<origin-repo> --base
   <default> --head <my-owner>:<current-branch>`, using the validated repositories
   and populated template body. Use an argument as title or issue context.
7. Verify the PR body and return the PR URL.
