# GitHub check, auto-merge, and event constraints

Research for
[Establish GitHub check, auto-merge, and event constraints](https://github.com/viscalyx/Kravhantering/issues/1419),
part of
[Specify CI selection and complete preview release policy](https://github.com/viscalyx/Kravhantering/issues/1417).
This is evidence for later policy decisions, not an implementation or a policy.

Repository source baseline:
[`c8b393b64300be7af7e1e5ee42b373cb29fc0d09`](https://github.com/viscalyx/Kravhantering/tree/c8b393b64300be7af7e1e5ee42b373cb29fc0d09).
Read-only API observations and GitHub documentation retrieval: 2026-09-12 UTC,
approximately 06:45–06:52. Settings and platform documentation can change;
source links use the fixed commit where applicable. Runtime execution and
published artifact audits belong to the separate release-chain investigation.

## Repository settings observed

The following are direct API observations, not inferred from workflow names.
Links identify the queried endpoints; their future responses are mutable.

- Repository default branch is `main`; auto-merge, merge commits, squash,
  and rebase merging are enabled. Automatic branch deletion is disabled.
  [Repository API](https://api.github.com/repos/viscalyx/Kravhantering).
- Classic protection on `main` requires exactly `quality-checks`, tied to
  GitHub Actions app ID `15368`, with `strict: true`. Admin enforcement,
  signatures, linear history, and conversation resolution are disabled.
  No required-review object appears in the response.
  [Main protection API](https://api.github.com/repos/viscalyx/Kravhantering/branches/main/protection).
- The effective active ruleset adds only deletion and non-fast-forward
  protection. Its target is the default branch and it has no bypass actors.
  The other repository ruleset, Code Quality Copilot review for default
  branch, is disabled. No merge queue rule is present.
  [Effective main rules](https://api.github.com/repos/viscalyx/Kravhantering/rules/branches/main),
  [rulesets including parents](https://api.github.com/repos/viscalyx/Kravhantering/rulesets?includes_parents=true),
  [active ruleset](https://github.com/viscalyx/Kravhantering/rules/13643097),
  [disabled ruleset](https://github.com/viscalyx/Kravhantering/rules/19486784).
- Actions are enabled, all actions are allowed, and platform SHA pinning
  enforcement is false. Default workflow token permissions are `write` and
  Actions may approve PR reviews. Explicit workflow/job permissions still
  narrow this default; repository source instructions independently require
  pinned external actions.
  [Actions permissions](https://api.github.com/repos/viscalyx/Kravhantering/actions/permissions),
  [workflow permissions](https://api.github.com/repos/viscalyx/Kravhantering/actions/permissions/workflow),
  [source security instructions](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/instructions/github-actions-security.instructions.md).
- Repository secret metadata contains `OPERATOR_UPGRADE_NOTES_TOKEN`, created
  and updated at `2026-07-03T16:26:21Z`. Metadata does not establish token
  kind, owner, scopes, expiry, or whether authentication currently succeeds.
  Secret values are not read or requested.
  [Secrets metadata API](https://api.github.com/repos/viscalyx/Kravhantering/actions/secrets).
- All 23 checked-in YAML workflows are active in the workflow API. Additional
  active dynamic workflows are Copilot cloud agent, Dependabot Updates,
  CodeQL - Code Quality, and CodeQL. CodeQL default setup is configured with
  the default suite, remote threat model, standard runner, and weekly
  schedule; its returned languages cover Actions, JavaScript, TypeScript,
  and Python. YAML path selection alone does not configure these services.
  [Workflow API](https://api.github.com/repos/viscalyx/Kravhantering/actions/workflows),
  [CodeQL setup API](https://api.github.com/repos/viscalyx/Kravhantering/code-scanning/default-setup).

No requested protection, ruleset, Actions-permission, workflow, or secret-name
endpoint is inaccessible with this session's credentials. Organization billing,
runner capacity, external deployment services, private token details, and
unexposed dynamic-workflow trigger configuration are outside these observations.

## Documented responsibilities versus enforced contexts

The
[CI integration ownership contract](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/docs/development/ci-integration-ownership.md)
says the owner configures these independent required results for the same
commit: `Pruned Runtime Contract`, `Browser Functional Integration`, five
`Candidate Build and Vulnerability Policy` results for app-runtime, db-job,
demo-seed, HSA directory mock, and HSA person lookup adapter, plus
`Production Assembly Acceptance`. It also retains `HSA mTLS topology required`.
The API presently enforces only `quality-checks`. This discrepancy is an input
to the reporting and implementation handoff decisions; it does not authorize
weakening documented coverage or silently changing protection.

The same contract assigns browser journeys to Browser Functional Integration,
six fixed production runtime specifications to Pruned Runtime Contract, seeded
MCP scanning solely to Security MCP, and isolated browser chunks to the weekly
complement. Container candidates own image identity and vulnerability evidence;
PR assembly consumes the exact core archives. Trusted release owns deeper
restart, reinstall, recovery, cleanup, containment, export concurrency, and HSA
validation. Earlier PR success therefore does not by itself cover every trusted
release responsibility. These are existing boundaries to preserve when
selecting work, not grounds for moving tests between suites.

## Workflow trigger inventory

Each filename below links the exact inspected configuration. `PR main` means
`pull_request` targeting main, with default opened/synchronize/reopened types;
`push main` means a branch push. A listed path filter applies only where the
source specifies it. This inventory describes eligibility, not proof a job
runs, publishes images, creates a release, or deploys an environment.

<!-- markdownlint-disable MD013 -->
| Workflow source | Eligible events and selection |
| :-- | :-- |
| [quality-checks.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/quality-checks.yml) | PR main; push main; no paths |
| [build-check.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/build-check.yml) | PR main; push main; no paths |
| [integration-tests.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/integration-tests.yml) | PR main; push main; no paths |
| [requirements-list-performance.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/requirements-list-performance.yml) | PR main; push main; no paths |
| [container-pr-smoke.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-pr-smoke.yml) | PR to any branch; no paths |
| [container-release.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml) | push main; stable-looking v tag globs excluding hyphen tags; manual dispatch |
| [security-repository.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-repository.yml) | PR main; push main; Monday schedule; manual dispatch |
| [security-api.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-api.yml) | PR main; push main; Tuesday schedule; manual dispatch |
| [security-mcp.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-mcp.yml) | PR main; push main; Wednesday schedule; manual dispatch |
| [security-dast.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-dast.yml) | PR main; no paths |
| [security-dast-api.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-dast-api.yml) | PR main with API/runtime/schema/scan/action path filter; manual dispatch |
| [devcontainer-image-smoke.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/devcontainer-image-smoke.yml) | PR main and push main with Dockerfile/tool-installer/workflow path filter |
| [powershell-tests.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/powershell-tests.yml) | PR main and push main with package/Azure-script/PowerShell-test/workflow path filter; manual dispatch |
| [copilot-setup-steps.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/copilot-setup-steps.yml) | PR and push matching its own workflow path; manual dispatch |
| [operator-upgrade-gate.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-gate.yml) | pull_request_target main: opened, synchronize, reopened, edited, ready_for_review; job excludes Dependabot |
| [ssdlc-gate.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/ssdlc-gate.yml) | pull_request_target main: opened, synchronize, reopened, edited, ready_for_review; job excludes Dependabot |
| [operator-upgrade-notes.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-notes.yml) | pull_request_target main: closed; job requires merged and excludes Dependabot build(deps) PRs |
| [container-vulnerability-monitor.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-vulnerability-monitor.yml) | daily schedule; manual dispatch; main in source repository only |
| [dependency-drift.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/dependency-drift.yml) | Monday schedule; manual dispatch; main only |
| [integration-isolation-weekly.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/integration-isolation-weekly.yml) | Sunday schedule; manual dispatch |
| [security-dast-roles.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-dast-roles.yml) | daily schedule; manual dispatch |
| [security-dast-full.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/security-dast-full.yml) | manual dispatch only |
| [reusable-container-runner-metadata.yml](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/reusable-container-runner-metadata.yml) | workflow_call only; called by container workflows |
<!-- markdownlint-enable MD013 -->

There are no checked-in `merge_group`, `workflow_run`, `release`,
`repository_dispatch`, or deployment-event consumers. External consumers are
not ruled out by this source inventory. Container Release handles trusted
validation and publication in one job, with no `needs` relationship to the
separate main CI workflows. Operator persistence and Container Release start
from different events and do not wait for each other.
[Workflow directory](https://github.com/viscalyx/Kravhantering/tree/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows).

## Skipping and required result reporting

GitHub distinguishes an absent workflow from a skipped job. Workflow branch,
path, or commit-message skipping leaves required results pending. A conditional
job skip reports success for merging. A dependent job skipped after an upstream
failure can also fail to block merging; an aggregate required job needs
`always()` and explicit evaluation of its dependencies. Reusing an earlier
commit's green result does not satisfy the latest required SHA. If a test merge
commit has checks, GitHub evaluates those; otherwise it evaluates head checks.
An expected GitHub App source is also part of required-check matching. These
constraints apply to any proposed lightweight result or aggregation design.
[Required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

Native path filters compare two-dot changes for pushes and three-dot changes
for PRs. The first 300 changed files bound filter evaluation; a relevant file
outside that list can miss triggering. More than 1,000 commits or a diff timeout
causes the workflow to run. Branch and path filters must both match. Tag pushes
ignore path filters. Explicit permissions set unspecified permissions to none.
[Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons).

Inference: a selector that considers only the latest push can overlook relevant
changes accumulated since the last published release. GitHub's event diff is
not a release-completeness ledger. The eventual policy must supply that meaning.

## Commit identity, reruns, and artifact evidence

A `pull_request` run normally checks the synthetic merge commit; head SHA is
separate. `pull_request_target` executes in the base-branch context. Dispatch
requires the workflow on the default branch and identifies a chosen branch or
tag. A merge queue would additionally require `merge_group` checks; none is
configured here. PR head, test merge, final main commit, and tag target must
therefore be distinguished by a reuse decision, even if some trees match.
[Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

A rerun keeps the original event's `GITHUB_SHA`, `GITHUB_REF`, and initiating
actor privileges. It is not a new validation request for today's main.
[Workflow reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).
`GITHUB_RUN_ID` stays fixed on rerun, while `GITHUB_RUN_ATTEMPT` increments.
[Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
An explicit checkout of a moving branch can still fetch different content:
Operator Upgrade Notes explicitly checks out `main`, whereas Container Release
uses the event checkout. This is an inference from those source configurations,
so event SHA alone cannot describe every command's actual inputs.

Artifact APIs expose artifact ID, name, digest, expiry, and associated run/head
metadata. Cross-run artifact retrieval requires identifying the run and suitable
Actions read permission. Record provenance and availability separately from a
producer's green job, especially when only failed jobs are rerun.
[Artifact API](https://docs.github.com/en/rest/actions/artifacts).
Modern uploaded artifacts are immutable; download digest mismatch is reported
as a warning by the documented action behavior. Candidate/archive verification
still needs its existing explicit acceptance checks.
[Artifact sharing and validation](https://docs.github.com/en/actions/tutorials/store-and-share-data).

## Concurrency and accumulated events

GitHub's default concurrency queue retains one running and one pending member.
A newer pending member replaces the old pending member even with
`cancel-in-progress: false`. The currently documented opt-in `queue: max`
retains up to 100 pending members, then cancels overflow; it cannot combine
with `cancel-in-progress: true`. FIFO concerns time entering the concurrency
wait, not event dispatch or merge order. This is a platform option, not a
repository configuration or a selected policy.
[Concurrency controls](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

No checked-in workflow configures `queue`. Operator Upgrade Notes uses a
workflow-specific main group with cancellation false. Container Release uses a
workflow-and-ref group with cancellation false. Thus neither protects every
pending event from replacement; their different workflow names do not serialize
notes against releases. Each stable tag also has a group distinct from main and
other tags. Several PR/main integration and security workflows cancel older
runs; Quality Checks and Build Check declare no concurrency group.
[Workflow configurations](https://github.com/viscalyx/Kravhantering/tree/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows).

Inference: serialization alone cannot establish note completeness or ensure
publication order across main and tags. A later decision must address recovery
of replaced, failed, delayed, or independently executing work.

## Automation identity and auto-merge

Current GitHub documentation has a specific exception to older blanket advice
about `GITHUB_TOKEN`. PR `opened`, `synchronize`, and `reopened` events produced
with it create workflow runs requiring approval by a repository writer. Other
PR activities, including edited and closed, do not create runs. Pushes and other
ordinary token-generated events also do not start workflows.
`workflow_dispatch` and `repository_dispatch` remain triggering exceptions.
A personal access token or GitHub App installation token can trigger automatic
runs without that PR approval step. These are platform facts retrieved on the
research date, not a verification of this repository secret's token type.
[Triggering workflows from workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).

Operator Upgrade Notes uses `OPERATOR_UPGRADE_NOTES_TOKEN` for branch push,
PR creation/update, and `gh pr merge --squash --auto --delete-branch` with the
expected head commit. Failed auto-merge requests produce a warning and leave
the PR for manual action. Repository token permissions do not establish the
separate secret's permissions. Container Release uses `github.token` for release
publication and tag operations, and the separate notes token for stable-note
archival. Token choice therefore changes downstream event behavior.
[Note persistence source](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-notes.yml),
[release source](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml).

Auto-merge waits for enforced reviews and checks and requires repository
support and write access to enable. A push or base change by someone without
write access can disable it. Enabling auto-merge is not evidence of a merge,
and merging is not evidence of release publication.
[Automatic merging](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request).

## Inputs to the remaining decisions

- Reporting: reconcile documented required contexts with actual enforcement;
  choose how every applicable required result terminates for selected work,
  deliberate omissions, reused evidence, and selector failures.
- Reuse: specify the commit, input, run-attempt, artifact, and trust evidence
  required before prior validation can cover a new publication candidate.
- Sequencing: define recovery for missing persistence events and accumulated
  unpublished changes, and publication order across concurrent main/tag runs.
- Automation: retain a verified event-producing identity or define the approval
  and dispatch behavior explicitly; the token's secret name is insufficient.
- Handoff: recheck live settings before implementation. Dynamic security
  services and external deployment consumers require their own evidence if the
  proposed selection policy changes their behavior.

These questions fit the map's existing selection, reuse/reporting, publication,
sequencing, and handoff decisions. No additional policy is chosen here.
