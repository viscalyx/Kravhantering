# Journal lifecycle

## Location decision

Use the main checkout's ignored `tmp/implement-stack/` directory. It gives
linked worktrees one discoverable state root outside Git metadata and keeps
independent clones separate. Both development container profiles persist
the checkout through a host bind mount, including this directory.

The Git common directory also shares state across worktrees, but mixes
workflow artifacts with Git internals. An external per-repository directory
needs separate identity, discovery and container persistence arrangements.
The existing ignored workspace directory avoids those additional conventions.
Its durability depends on retaining the checkout and its ignored files;
moving state here does not bound disk growth or provide a backup.

## Discovery

1. Read `git worktree list --porcelain -z`. Parse NUL-delimited records;
   the first record identifies the main checkout, even from a linked worktree.
   See [Git's worktree format](https://git-scm.com/docs/git-worktree#_porcelain_format).
2. Resolve that checkout's physical absolute path. Require an accessible,
   non-bare working tree whose top level matches that path and whose
   `git rev-parse --path-format=absolute --git-common-dir` matches the caller's
   canonical common directory. A bare first record, missing checkout or
   mismatch blocks the prerequisite; report the required checkout repair.
   Use neither the caller's top level nor the common directory's parent as a
   fallback.
3. Set `<state-root>` to `<main-worktree>/tmp/implement-stack/`. Confirm it is
   ignored and stays within that checkout after resolving symlinks. Report
   an inaccessible or shared external destination as a blocked prerequisite.
4. Check `<git-common-dir>/implement-stack/<spec-number>/` for this Spec's
   legacy journal. Check both `<git-common-dir>/implement-stack/writer.lock`
   and `<state-root>/writer.lock` for old repository-wide claims. An existing
   claim requires an ownership handoff before using the concurrent protocol;
   this Spec's legacy journal requires [legacy handoff](#legacy-handoff).
   Other Specs' retained journals do not block this run. Absent legacy state
   needs no reconstruction. If this Spec's expected journal is missing, report
   the recovery gap and obtain direction before treating it as a new run.
5. Use the resolved root for [ownership](state-and-recovery.md#journal-and-ownership).
   Resume from existing journal contents; preserve earlier evidence and append
   new observations instead of initializing another journal for the same Spec.

## Legacy handoff

- Preserve this Spec's legacy state until the user explicitly requests
  relocation. Report its location and block a second journal for the same Spec.
- Obtain handoff from this Spec's owners in both locations and any owner of
  an old repository-wide claim. Stop their mutations, confirm the owners'
  release of those claims, and require resumed agents to use per-Spec claims
  and catalog coordination. Age or a missing process alone is not proof of
  relinquished ownership. Leave other Specs' current claims intact.
- Inventory this Spec's journal, logs and catalog copies, including incomplete
  work. With its owners stopped and user authorization, move only its legacy
  directory to `<state-root>/<spec-number>/` when that destination is absent.
  If this Spec has state in both locations, preserve both and resolve the
  conflict with the user before moving anything; never overwrite or silently
  combine journals. Leave unrelated legacy directories in place.
- Verify inventory and file contents at the destination, record the old and
  new locations in the journal, and update the Spec's location before resuming
  through the normal ownership check. Keep Git recovery refs, worktrees and
  third-party recovery journals in their own locations.

## Retention and manual cleanup

- Cleanup belongs to the user. Retain journals, logs, catalog copies,
  worktrees and recovery refs after publication, merge, abandonment, failure
  and interruption until the user removes them. No repository workflow owns
  later cleanup; no expiry, automatic deletion or cleanup command applies.
- Release only the current session's writer claim when handing off ownership.
  Releasing a claim leaves recovery artifacts intact; an interrupted owner's
  claim still requires the ownership check before takeover.
- At publication, report the resolved journal location and user-controlled
  cleanup. Explain that manual removal or workspace cleaning can erase recovery
  evidence. Keep evidence needed by active or incomplete runs; the user must
  establish that follow-up and recovery no longer need it before removal.
- Deleting a journal does not delete Git worktrees or recovery refs. Those
  artifacts remain separately under the user's control.
