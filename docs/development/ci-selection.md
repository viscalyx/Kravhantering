# CI selection and release verification

The reusable validation-selection workflow collects complete changed paths at
its caller's event source. Every caller runs selection afresh and receives
owners, reasons and release eligibility. `scripts/release/selection.mjs` owns
the deterministic policy. Git and GitHub access stay in the script adapters.
The integration manifest supplies the existing browser/runtime ownership split.
Copilot setup uses the same script from its single supported setup job; GitHub's
setup contract does not support a reusable-workflow dependency. Agent sessions
keep their setup responsibility, while PR/push setup checks use path selection.

Documentation, contributor instructions and operator-note corrections select
formatting, spelling, Markdown and link checks. Test paths select their complete
owners and prerequisites, including nested and package tests. Shared runners
and fixtures select their consumers. Production, dependency and packaging
inputs select applicable validation and release work. Mixed inputs take the
union. Unknown paths select all applicable owners. Renames use their destination;
deletions use the deleted path. Failed or incomplete collection blocks checks.

Whole suites use native job skips and partial quality selections use native
step skips. Required reporting retains existing context names, describes policy
exclusions, and fails selected failed, cancelled, missing or unexpectedly
skipped work. Diagnostics follow the owner that ran. Main does not acquire
PR-only suites; scheduled and manual responsibilities remain intact. Each
separate run validates its own source, including a release after a successful PR.
GitHub-managed CodeQL and Secret Protection remain independent.

## Maintainer verification after merge

Use actual runs and downloaded artifacts to complete this handoff. These checks
are manual acceptance work, not a pre-merge live-publication requirement.

1. Review documentation-only, nested/package-test-only, production, shared-input
   and mixed PR/main runs. Confirm selected complete owners, native skips with
   reasons, candidate prerequisites, required contexts and auto-merge behavior.
2. Inspect a failed prerequisite and a cancelled selected job. Confirm required
   reporting cannot accept either as a policy exclusion. Review diagnostics.
3. Review scheduled security, vulnerability, dependency and isolation owners,
   explicit validation dispatches, and stable tags for unchanged obligations.
4. Verify eligible releases with and without new notes. Compare source SHA,
   registry digests, complete Unreleased release-page text, and the full notes
   document inside the downloaded archive.
5. Check that documentation/test-only main events exclude both publishers after
   an earlier failed run. Request an explicit documentation preview from main;
   advance main while queued and verify the dispatch source stays fixed.
6. Inspect partial delivery and use a native failed-job rerun. Confirm original
   identity, matching-content preservation, missing-stage completion, conflicts
   that stop writes, uncertain-response inspection and concurrency behavior.
7. Review stable archival against tagged notes while main has newer guidance.
   Preserve newer entries and history. Reconcile changed shipped guidance,
   outstanding old-model notes and persistence PRs manually.
8. Exercise push/PR guidance for approval, decline, a user no-notes decision and
   adequate already-committed notes. Confirm repository and configured runtime
   copies agree. Verify automatic PR declarations before merge.

Investigate and fix any selection, reporting, publishing or archival regression.
Maintainers decide recovery or rollback manually. Record actual completed
stages; record environment deployment only from separate deployment evidence.
Application functional cases do not change in this delivery-only work.
