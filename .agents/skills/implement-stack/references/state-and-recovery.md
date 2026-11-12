# State and recovery

## Journal and ownership

- Resolve the shared state root and any legacy state through
  [journal discovery](journal-lifecycle.md#discovery) before claiming or
  resuming work.
- Store the journal, logs and catalog copies under `<state-root>/<spec-number>/`
  and put the resolved location on the Spec. Keep runtime state out of commits.
- After discovery and legacy checks pass, create `<state-root>/<spec-number>/`
  and any missing parent directories. Preserve existing contents.
- Claim one writer per Spec through atomic directory creation at
  `<state-root>/<spec-number>/writer.lock` without recursive or exist-ok
  options; an existing claim must fail acquisition. Record session and Spec.
  Different Specs may run concurrently with separate branches and worktrees;
  a second session for the same Spec must obtain the existing owner's handoff.
  Check the existing owner before resuming or taking over. Tracker assignment
  to the same user does not prove that another session has relinquished work.
  Repeat the legacy checks after acquiring the claim; if a conflicting claim
  or this Spec's legacy journal appears, release only this session's claim
  and follow the legacy handoff.
- The orchestrator owns stack mutations, publication, and tracker writes.
  gh-stack's mutation lock does not coordinate workers' Git commands; require
  explicit ownership handoff before changing their branches. Serialize shared
  catalog operations through [catalog coordination](#catalog-coordination).
- Record the immutable starting commit, target, verified tip, dependencies,
  ordered layers, owners/worktrees, dispatch bases, returned and integrated
  heads, PR/stack identities, expected remote heads, and verification evidence.
- Journal each mutation's intent and observed result. Before rewriting,
  preserve affected heads under `refs/implement-stack/<batch>/...` and copy
  the gh-stack catalog. Retain the tool's own recovery journals. Record
  tracker writes separately from integration so either can resume.

## Catalog coordination

- Hold the Spec's writer claim throughout its run. Additionally acquire
  `<state-root>/catalog.lock` by atomic directory creation before gh-stack
  catalog mutations, catalog snapshots or recovery. Record session, Spec and
  operation; inspect the existing owner and queue when another session owns it.
- Under this claim, refresh the catalog and confirm the affected branches
  belong to this Spec. Hold it across related operations such as add/rebase,
  target movement or publication linking, then release it when the catalog
  and Git operation are consistent. Preserve other Specs' stacks and refs.
- Keep implementation, tests, reviews and CI waits outside the catalog claim.
  If a catalog operation pauses for conflicts, retain the claim until it is
  continued or safely aborted. Other Specs can keep working independently
  while their catalog mutations wait.
- After interruption, obtain the catalog owner's handoff before recovery.
  The handoff must transfer ownership of the retained
  `<state-root>/catalog.lock` to the recovery process, or safely abort the
  paused operation and release the lock so other Specs can resume catalog
  mutations.
  Reconcile current state with the saved copy and restore only this Spec's
  records; a whole-catalog rollback can discard another Spec's later work.

## Queued reviews

- When nested `code-review` agents lack capacity, queue the review phase.
  As an explicit exception to the normal review-before-commit order, have
  the worker commit a provisional checkpoint,
  stop background processes, relinquish its clean worktree, and return its
  pending reviews and checks.
- Record the checkpoint, ownership handoff, and pending work in the journal.
  Resume the worker when capacity permits its required parallel reviews;
  prioritize queued reviews as slots become available.
- Treat checkpoints as scheduling handoffs. Integrate or close a ticket only
  after its required reviews and verification pass.

## Conflicts and failed checks

- Keep the last verified tip. Pause new integrations and ordinary dispatch
  until the combined result is valid; already running workers may continue.
- For gh-stack conflicts, resolve and stage in the reported worktree, then
  use `gh stack rebase --continue`. For a substantive fix, transfer that
  worktree to a fresh repair agent for resolution edits only; the orchestrator
  retains continuation. This is a paused operation, not a normal `implement`
  task that can commit and review independently.
- Once the operation completes, route code fixes through the failing-layer
  path below. Preserve useful resolution edits before aborting, and use the
  matching tool's abort only when restoration cannot discard newer work.
  Check both refs and metadata afterward; adoption can survive a rebase abort.

## Repair a failing layer

A later repair layer cannot fix checks on an earlier PR's head. Use this
path when that earlier head fails; append cumulative improvements only when
the preceding layers remain valid.

1. Preserve the failing layer and its suffix, obtain ownership handoffs, and
   return affected published PRs to draft. Pause integration and dispatch.
2. Dispatch a fresh worker using the main skill's dispatch instructions, based
   on the failing layer's exact head. Keep its repair branch outside the stack.
3. Inspect the returned descendant commit. In the failing layer's clean
   worktree, confirm the expected old head and fast-forward the work branch:

   ```bash
   git merge --ff-only <repair-commit>
   gh stack rebase --no-trunk
   ```

4. Record the rewritten suffix. Return to integrated verification and batch
   review, then republish affected heads with recorded leases. Each changed
   PR needs valid checks before becoming ready again.
5. Add repair evidence to the original issues without reopening them. Retain
   the repair branch as recovery evidence, not another PR.

## Resume and partial publication

- Repeat journal discovery and re-establish ownership; compare the existing
  journal with worktrees, agents, refs,
  gh-stack state, remote stack/PRs, and target before another mutation.
- Complete or safely abort a paused operation using its recorded worktree
  and tool version. Native Git and gh-stack rebases have different recovery
  journals; continue the operation actually in progress.
- Preserve a missing worker's work; reassign only after its former owner has
  stopped. Reconcile unexpected remote changes rather than replacing the
  recorded lease with the newly observed head.
- After interrupted publication, read remote state, find existing PRs by
  exact head/repository, and retry only missing steps. Check existing tracker
  comments and closure before repeating writes.
- External merge, closure, auto-merge, or queueing is a divergence to report;
  leave further publication paused rather than merging or rebuilding the
  stack automatically. Preserve incomplete work and record the next action.
