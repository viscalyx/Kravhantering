# Container release reconciliation trigger research note

Research date: 2026-08-26

## Decision summary

Use a typed `repository_dispatch` event, for example
`container-release-published`, emitted immediately after the existing GitHub
Release asset upload succeeds. Add that event type to the Container
Vulnerability Monitor while retaining its scheduled and manual triggers.

This is the best fit for the current repository because the release workflow
already knows the exact publication boundary. It promotes and verifies the
container images before the `Publish GitHub Release` step, and that step creates
or edits the release before uploading all release assets. A separate dispatch
step guarded by `RELEASE_CREATE_GITHUB_RELEASE == 'true'` therefore runs only
after an actual supported release publication, whether the release is a preview
generated from `main` or a stable release from an eligible version tag. See the
current
[`Container Release` workflow](../../.github/workflows/container-release.yml)
and its
[`createReleasePlan` rules](../../scripts/release/container-release.mjs).

GitHub normally prevents events created with a workflow's `GITHUB_TOKEN` from
starting another workflow. `repository_dispatch` and `workflow_dispatch` are
explicit exceptions, so no personal access token or additional GitHub App is
needed. See GitHub's
[`GITHUB_TOKEN` event semantics](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).

The repository-dispatch endpoint requires `Contents: write`. The trusted
release job already has that permission because it creates tags and releases.
By contrast, the workflow-dispatch endpoint requires `Actions: write`, which
would broaden the current release job's token. See the REST permissions for
[`repository_dispatch`](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
and
[`workflow_dispatch`](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

The receiving monitor remains a separate run with its existing permissions:
`attestations: read`, `contents: read`, `packages: read`, and `issues: write`.
The confidential-advisory secret remains scoped to its synchronization step.
This avoids running the monitor under the release job's broader publication
permissions. The current boundary is visible in the
[`Container Vulnerability Monitor`](../../.github/workflows/container-vulnerability-monitor.yml),
and GitHub recommends granting the `GITHUB_TOKEN` only the minimum permissions
required by each job in its
[`GITHUB_TOKEN` security guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token).

## Event contract and trust boundary

The monitor should subscribe only to a dedicated activity type:

```yaml
on:
  repository_dispatch:
    types: [container-release-published]
  schedule:
    - cron: '43 4 * * *'
  workflow_dispatch:
```

`repository_dispatch` runs from the default branch and uses its latest commit
as `GITHUB_SHA`. The receiving workflow file must also exist on the default
branch. A stable tag publication will therefore execute the current monitor
implementation from `main`, rather than the potentially older implementation
stored at the release tag. See GitHub's
[`repository_dispatch` event contract](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch).

Keep `client_payload` to non-secret correlation data:

- release tag;
- source workflow run ID and run attempt;
- source commit SHA; and
- source ref.

The monitor must treat those fields as evidence, not authority. It should still
select supported releases through the GitHub Releases API, download the
published metadata and SPDX assets, and verify their hashes and attestations as
it does now. The repository-dispatch API permits at most 10 top-level payload
properties and a payload smaller than 64 KB; a successful request returns
`204 No Content`, not a downstream run URL. See the
[`repository_dispatch` REST contract](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

Record the correlation fields and source-run URL in the monitor's step summary
and retained evidence. This gives a triggered run a direct path back to its
publication even though the dispatch response cannot link forward to the new
run. A rerun of the release workflow can emit another dispatch; include both
run ID and run attempt so the source is unambiguous. GitHub exposes
`github.run_attempt` specifically to distinguish attempts of one workflow run
in the
[`github` context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context).

## Failure and recovery behavior

Put dispatch in a named step immediately after `Publish GitHub Release`, do not
mark it `continue-on-error`, and keep the existing `if: always()` evidence
uploads. This produces three observable boundaries:

1. Image or GitHub Release publication failure prevents dispatch.
2. Dispatch API rejection fails the release run after publication while the
   release run still retains its evidence.
3. Monitor failure appears on the independent monitor run, whose own workflow
   uploads complete scan evidence before failing.

The scheduled run remains the recovery path if GitHub accepts a dispatch but
the downstream run does not complete. Manual dispatch remains available for an
operator retry. Each scan reconstructs current state from the supported GitHub
Releases instead of applying a payload delta, so every later successful scan
can repair a missed or failed release-triggered reconciliation. That behavior
is already the monitor's documented model in
[`Trusted Container Publishing`](../development/trusted-container-publishing.md#continuous-published-release-scanning).

There is one deliberate status boundary: because repository dispatch is
asynchronous, a failed monitor does not change a successfully completed release
run to failure. Coupling those outcomes would require polling another run or
moving reconciliation into the release workflow, both of which increase
permissions or workflow coupling. The release-to-monitor orchestration decision
should explicitly accept or reject this boundary.

## Concurrency

All scheduled, manual, and repository-dispatch executions must share one
repository-wide concurrency group. Keep `cancel-in-progress: false` so an
in-progress issue reconciliation is never interrupted by a newer release.

GitHub's default concurrency queue retains one running and only one pending
run; a newer pending run replaces the existing pending run. That coalescing is
state-safe here because every run performs full reconciliation, but it does not
preserve one completed monitor run per publication. If the audit requirement is
that every accepted publication trigger executes, set `queue: max`, which
allows up to 100 pending runs. GitHub documents both behaviors and notes that
the apparent dispatch order does not guarantee execution order in its
[`concurrency` reference](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

A fixed group name such as `container-vulnerability-monitor-main` makes this
serialization invariant independent of trigger type or a future workflow-name
change. The full-state algorithm makes ordering irrelevant to the final issue
state, but deterministic issue-body generation and idempotent synchronization
remain required.

## Alternatives

### `release: published`

The event is semantically attractive because `published` covers stable and
prerelease publication. It is not reliable for this repository: the current
release is created with the built-in `GITHUB_TOKEN`, and release events caused
by that token do not start another workflow. Using a personal access token or
GitHub App token solely to bypass that protection adds a long-lived or
separately managed credential without improving the publication signal. See
the [`release` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)
and the
[`GITHUB_TOKEN` recursion rule](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).

### `workflow_run`

`workflow_run` can start a default-branch monitor after `Container Release`
completes, inspect its conclusion, and download source-run artifacts. It sees
the whole workflow conclusion rather than the `Publish GitHub Release` step.
A later operator-note, metadata-upload, or runner-metadata failure can therefore
produce a failed workflow even though release publication succeeds. Conversely,
a successful `main` snapshot run may publish only commit image tags and no
GitHub Release, so success alone is not proof of a supported release.

The trigger has branch filters but no documented tag filter. The repository's
[stable v0.5.0 run](https://github.com/viscalyx/Kravhantering/actions/runs/32637969674)
shows the tag name as the run's head branch, so a `branches: [main]` filter
would omit that path. Artifact inspection can recover the release plan, but
that is more indirect than emitting the fact at the publication step. GitHub
documents conclusion checks, branch filters, artifact access, and the
privileged-trigger security warning in the
[`workflow_run` reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

### Reusable workflow through `workflow_call`

A reusable monitor provides direct dependency and same-run failure visibility
after publication is split into a distinct job. It is not callable as a step;
reusable workflows are called as jobs. Permissions can only stay the same or
be reduced through the call chain, and secrets must be explicitly passed or
inherited. A same-repository local call also resolves from the caller's commit,
so a stable tag would run the monitor implementation stored at that tag rather
than current `main`. See GitHub's
[`workflow_call` usage](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow)
and
[`reusable-workflow permissions`](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#supported-keywords-for-jobs-that-call-a-reusable-workflow).

This option becomes preferable only if the release workflow is deliberately
restructured into separate publication and post-publication jobs and the
monitor outcome must gate the overall release workflow.

### Programmatic `workflow_dispatch`

`workflow_dispatch` is another reliable `GITHUB_TOKEN` exception. It can target
`main`, accept typed inputs, and return the created run's ID and URLs, giving
better forward linkage than repository dispatch. Its REST endpoint requires
`Actions: write`, which the current trusted release job does not have. It is a
reasonable alternative if direct downstream-run linkage is more important than
avoiding that permission expansion. See the
[`workflow_dispatch` REST endpoint](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

## Recommendation for the decision ticket

Choose `repository_dispatch` unless the monitor result must gate the Container
Release workflow itself. It is the only option that simultaneously marks the
exact existing publication step, executes the current monitor from `main`,
preserves the monitor's independent least-privilege token, and needs no new
credential or release-job permission.

The follow-on orchestration decision still needs to settle two policy choices:

- whether asynchronous monitor failure remains independent of release status;
  and
- whether full-state coalescing is acceptable or `queue: max` must preserve an
  execution for every publication signal.
