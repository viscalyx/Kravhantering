# Git and publication

## Prerequisites

- Use gh-stack v0.2.0 as the verified baseline. Inspect installed versions,
  command help, authentication, and write access before use. If absent,
  install with `gh extension install github/gh-stack --pin v0.2.0`; validate
  command differences before using another version. Finish recovery with
  the version that started it.
- All PR branches must be in the target repository. Resolve both the push
  remote and `gh repo view --json nameWithOwner`; gh-stack's `--remote` does
  not override its API context.
- Check `gh api 'repos/<owner>/<repo>/stacks?per_page=1'` for native stack
  availability. Read access alone does not establish publication permission.
- Apply [catalog coordination](state-and-recovery.md#catalog-coordination)
  around shared gh-stack operations. Use Spec-qualified branch, worktree and
  recovery-ref names. `init --base <target>` leaves an existing local
  target alone, but can fetch and create it if absent; recheck the captured
  target after initialization.

## Adopt and integrate

For the first relinquished branch, created at the batch's starting commit:

```bash
gh stack init --base <target> <first-branch>
```

For each later branch, run from the current top's owning worktree:

```bash
gh stack add <returned-branch>
gh stack rebase --no-trunk --upstack <returned-branch>
```

`add` adopts an existing branch; integration happens in the rebase. This
range excludes earlier layers and leaves the target untouched. Use the new
top's worktree for the next adoption. Confirm the previous verified tip is
an ancestor of the result and inspect replayed changes before verification.

## Target movement

Preserve layer refs and the old target, obtain all affected handoffs, and
return published PRs to draft before rewriting. Journal two distinct phases:

1. Rebase the bottom layer in its owning worktree:

   ```bash
   git rebase --onto <new-target-commit> <old-target-commit> <bottom-branch>
   ```

   Continue conflicts with `git rebase --continue`. Preserve the prior
   gh-stack catalog until the cascade so it retains the old parent tips.
2. From a stack member's worktree, cascade the remaining layers:

   ```bash
   gh stack rebase --no-trunk
   ```

   Continue conflicts with `gh stack rebase --continue`.

Check ancestry and changed diffs, then return to integrated verification and
batch review using the new target commit as the fixed point. Preserve the
starting commit in the journal.

## Publish

Use explicit pushes and PR creation followed by `gh stack link`. `submit`
would add pushes and generated PR text; `sync` also reconciles remote state.

1. Compare remote batch heads with recorded values; reconcile unexpected
   changes before writing. Push reviewed SHAs with explicit leases:

   ```bash
   git push <remote> <reviewed-sha>:refs/heads/<branch> \
     --force-with-lease=refs/heads/<branch>:<expected-remote-sha>
   ```

   An empty expected SHA requires an absent remote branch. Read back each
   result. Push only batch work branches, never the target or recovery refs.
2. Reuse matching open PRs or create drafts, bottom to top, using the
   repository PR template and its Markdown publication rules. Use non-closing
   issue references so the Spec stays open. Each PR's upgrade declaration
   must agree with its layer's `operator-upgrade-notes` assessment.

   ```bash
   gh pr create --repo <owner/repo> --base <previous-branch-or-target> \
     --head <branch> --draft --title <title> --body-file /absolute/pr-body.md
   ```

3. For two or more PRs, link their full URLs in bottom-to-top order:

   ```bash
   gh stack link --remote <remote> --base <target> <pr-url-1> <pr-url-2> ...
   ```

   Validate URL repositories against the API context; the tool only extracts
   their PR numbers. URL arguments avoid extra pushes and generated bodies;
   omitting `--open` preserves drafts. Linking can change bases and leaves
   local tracking unchanged, so journal the PR mapping and server stack ID.
   For appended repairs, pass the full ordered list with existing members
   as its unchanged prefix. One layer remains an ordinary PR; omit empty
   layers instead of creating artificial commits.
4. Read the server stack and every PR; compare target, ordered membership,
   bases, and head SHAs against the reviewed state. Local stack views and
   successful exit codes do not establish publication: some failures only
   produce warnings. Require open/unmerged PRs without auto-merge or queueing.

   ```bash
   gh api 'repos/<owner>/<repo>/stacks?pull_request=<pr-number>'
   gh api repos/<owner>/<repo>/stacks/<stack-number>
   ```

5. Use [CI monitoring](ci-monitoring.md) to wait for required CI on every
   published head. Route failures through
   [Repair a failing layer](state-and-recovery.md#repair-a-failing-layer).
   Once all evidence is valid, mark each PR ready with
   `gh pr ready <pr> --repo <owner/repo>`. Read back the complete stack again
   and start the watcher's ready phase with the applicable readiness-triggered
   checks. Require fresh successful evidence after each readiness-triggered
   check's `readyAfter` boundary. Checks without `readyAfter` may reuse
   successful evidence from the same head. Report outstanding human approvals
   separately from required CI.

Completion: exact intended PRs, order, heads, and bases are confirmed;
every PR is non-draft with valid required checks. For later changes, restore
affected PRs to draft with `gh pr ready <pr> --repo <owner/repo> --undo`
before invalidating their evidence. Read-back verifies a snapshot, not a
lock or a guarantee about a later merge.

## Primary references

Consult when command versions or server behavior differ:

- [gh-stack v0.2.0](https://github.com/github/gh-stack/blob/v0.2.0/README.md)
- [Branch adoption](https://github.com/github/gh-stack/blob/v0.2.0/cmd/add.go)
- [Rebase and recovery](https://github.com/github/gh-stack/blob/v0.2.0/cmd/rebase.go)
- [Linking existing PRs](https://github.com/github/gh-stack/blob/v0.2.0/cmd/link.go)
- [Native stack API](https://docs.github.com/en/rest/pulls/stacks)
