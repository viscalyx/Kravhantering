# CI, preview publication, and operator-note event chains

Research for
[Audit CI, preview artifacts, and operator-note event chains](https://github.com/viscalyx/Kravhantering/issues/1418).
Observation date: 2026-09-12, approximately 06:56 UTC. The code baseline is
[main at the operator-note persistence merge](https://github.com/viscalyx/Kravhantering/tree/c8b393b64300be7af7e1e5ee42b373cb29fc0d09).
This document records evidence and decision constraints, not release policy.

## Findings

- Both inspected source previews include the complete source PR operator-note
  text in their **GitHub Release bodies**, allowing whitespace normalization.
  The successful persistence preview repeats the source preview's notes.
- The three downloaded deployment archives contain no
  `operator-upgrade-notes.md` and no source PR note payload. Whether notes must
  also travel inside the archive is an unresolved delivery-surface decision.
- A non-release prose merge still builds and promotes six container images
  under twelve commit tags, while skipping its GitHub preview release.
- A successful release can coexist with a failed independent push integration
  run. The release workflow validates its own candidates; it does not await
  the other push workflows.
- Current synchronization queries only PRs associated with the triggering
  commit. It is not reconciliation over all unpublished changes, and lookup
  or per-PR synchronization errors allow the release to continue.

The following sections identify the sources and limits for each finding.

## Workflow coverage at the baseline

The checked-in workflow inventory distinguishes these trigger families:

- Every PR targeting main and every main push: Quality Checks, Build Check,
  Integration Tests, Requirement List Performance, Repository Security,
  Security API, and Security MCP. There are no path filters on these triggers.
- Every PR: Container PR Smoke; PRs targeting main: Security DAST. These add
  candidate builds/scans and application security checks to notes-only PRs.
- Path-filtered PR checks: Security DAST API. Path-filtered PR and push checks:
  PowerShell tests and Devcontainer Image Smoke. Copilot Setup Steps runs for
  changes to its own workflow and by manual dispatch.
- PR metadata events: Operator Upgrade Gate and SSDLC Gate use
  `pull_request_target`; Operator Upgrade Notes uses its `closed` event and
  a merged-PR job condition. Bot exceptions are explicit in those workflows.
- Container Release: every main push, stable version tag pushes, and manual
  dispatch. Its job accepts main or a version-tag ref.
- Scheduled/manual work, not an additional merge-triggered deployment:
  Container Vulnerability Monitor, Dependency Drift, Weekly Integration Chunk
  Isolation, Security DAST Roles, and Security DAST Full (manual only).
  Repository Security, Security API, and Security MCP also have schedules
  and manual dispatch. Container Runner Metadata is a reusable workflow.

Sources: immutable
[workflow directory](https://github.com/viscalyx/Kravhantering/tree/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows),
[release triggers](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml#L1-L27),
[notes triggers and serialization](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-notes.yml#L1-L25).

Actual run lists additionally expose dynamically configured **CodeQL** and
**CodeQL - Code Quality**, absent from the checked-in workflow inventory.
Both occur at the representative notes and ordinary-prose commits; for
example
[CodeQL on the prose merge](https://github.com/viscalyx/Kravhantering/actions/runs/34465856677)
and
[CodeQL - Code Quality on the prose merge](https://github.com/viscalyx/Kravhantering/actions/runs/34465856896).
Their configuration and required-check status are outside this code audit.

## Current event chain and selection boundaries

A main push independently starts the validation workflows and Container
Release. Release planning uses `git diff --name-only before head`; when the
push's `before` is absent or zero, it uses `git diff-tree` for the head, with
an error fallback to an empty list. The decision is **not** based on the last
successfully published preview. Main creates a GitHub preview only if at
least one changed path matches the explicit release-input list; stable tags
create releases regardless of that classification. Manual main dispatch uses
this same fallback selection rather than an unconditional publish override.
See
[change selection and release planning](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/container-release.mjs#L299-L449).

The list includes application/runtime inputs, containers, release scripts,
selected deployment documentation, images, and operator upgrade notes.
Ordinary Markdown is not uniformly a release input. Some packaged inputs,
such as `docs/operations/transient-state-cleanup.md`, occur in the static
archive entries without their own matching entry in the relevance list.
Classification therefore needs comparison against actual packaged inputs.
See
[release relevance and archive inputs](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/container-release.mjs#L51-L127).

Only a planned preview synchronizes notes before building. It calls
`sync-commit-prs --commit GITHUB_SHA`, makes one commit-to-PR API request,
then consumes the returned PR bodies. It does not enumerate the push range,
filter on a merged flag, paginate, retry, or wait for persistence. A lookup
failure returns `lookup-skipped`; invalid note content is caught per PR.
These warnings allow progress. Existing source markers make synchronization
idempotent, including when a marker is in archived history; edits to an
already-synchronized PR body do not overwrite its persisted block. Sources:
[preview synchronization step](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml#L95-L102),
[lookup and error handling](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/operator-upgrade-notes.mjs#L279-L398),
[source-marker handling](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/operator-upgrade-notes.mjs#L154-L187).

Candidate builds, vulnerability policy, production-stack verification, and
registry promotion occur even when `createGitHubRelease` is false. That flag
controls preview tags, release publication, and parts of archive provenance;
registry promotion requires successful preceding release steps. No dependency
on Build Check or Integration Tests is declared. Sources:
[release build and validation pipeline](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml#L104-L407),
[publication conditions](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml#L767-L828).

In parallel, merged PR notes are persisted on the shared
`automation/operator-upgrade-notes` branch, rebased on main, with an automated
PR and auto-merge request using a dedicated token. Missing token or sync
errors fail this persistence workflow; failure to enable auto-merge warns.
Its concurrency group differs from Container Release's per-ref group, so
neither workflow provides a cross-workflow barrier. Sources:
[persistence branch preparation](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-notes.yml#L27-L92),
[persistence PR and auto-merge](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/operator-upgrade-notes.yml#L94-L200).

## Observed source and persistence previews

For
[Link improvement suggestions to implementing requirement versions](https://github.com/viscalyx/Kravhantering/pull/1407),
the source merge is `524e77264ce761f803f32717d10de7b8ef55ff0c` at
2026-09-10 19:09:58 UTC. Its
[source release run](https://github.com/viscalyx/Kravhantering/actions/runs/34518761807)
starts at 19:10:01 and reports note synchronization at 19:10:48. The downloaded
metadata artifact's plan records `hasRelevantChange: true`,
`createGitHubRelease: true`, and `v0.7.0-preview.66`.
[The source preview](https://github.com/viscalyx/Kravhantering/releases/tag/v0.7.0-preview.66)
has publication time 19:55:40 UTC.

The separate
[operator-note persistence PR for improvement suggestions](https://github.com/viscalyx/Kravhantering/pull/1409)
changes only `docs/operations/operator-upgrade-notes.md`, merging as
`a98868fd001506bc9c0f907c0f85842cd29db740` at 19:27:20 UTC. Its
[persistence release run](https://github.com/viscalyx/Kravhantering/actions/runs/34520504482)
starts at 19:27:24 and publishes
[the persistence preview](https://github.com/viscalyx/Kravhantering/releases/tag/v0.7.0-preview.67)
at 20:38:37 UTC. Both release bodies contain all three paragraphs of the
source PR's operator impact, modulo whitespace. The persistence merge does
not add missing source-note text to the first preview.

Both release jobs conclude successfully, but the persistence commit's
[independent Integration Tests run](https://github.com/viscalyx/Kravhantering/actions/runs/34520503986)
concludes with failure. This is evidence of the current independence of the
pipelines, not a judgment about the policy that should replace it.

For
[Adopt public UBI Node.js 24 across the six release images](https://github.com/viscalyx/Kravhantering/pull/1413),
the source merge is `6d369065277b0d3f97fdd9189db720ba5bec372d` at
2026-09-12 06:05:15 UTC. Its
[source release run](https://github.com/viscalyx/Kravhantering/actions/runs/34677222706)
reports synchronization at 06:06:11 and publishes
[the UBI source preview](https://github.com/viscalyx/Kravhantering/releases/tag/v0.7.0-preview.71)
at 06:46:16. Both source PR operator-note paragraphs are present, modulo
whitespace. The
[UBI operator-note persistence PR](https://github.com/viscalyx/Kravhantering/pull/1414)
merges at 06:18:42 as the audit baseline commit. Its
[persistence release run](https://github.com/viscalyx/Kravhantering/actions/runs/34677798128)
is still in progress at the observation cutoff; no publication conclusion is
inferred from its start or successful intermediate steps.

The release workflow and note synchronization script have identical Git blob
identities at the improvement-suggestion source commit and audit baseline:
`0049a9628102663da7b75a9f0de0011a24e53828` and
`085b285e8ca1888466d072c6579d57eab392f093`, respectively. The UBI source changes
other release-script details; current baseline code is not assumed to describe
all older image builds. Sources:
[historical release workflow](https://github.com/viscalyx/Kravhantering/blob/524e77264ce761f803f32717d10de7b8ef55ff0c/.github/workflows/container-release.yml),
[historical note synchronization](https://github.com/viscalyx/Kravhantering/blob/524e77264ce761f803f32717d10de7b8ef55ff0c/scripts/release/operator-upgrade-notes.mjs).

## Published archives and image identities

The following deployment archives are downloaded from their published
releases, read as tar archives, and checked against their SHA-256 sidecars.
None contains `operator-upgrade-notes.md`, and searching Markdown/JSON members
finds none of the corresponding source PR note payloads. The release bodies
are a separate delivery surface. This finding does not itself establish a
violation of a delivery contract that the map has yet to decide.

- [Improvement source archive](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.66/kravhantering-production-deploy-0.7.0-preview.66.tar.gz):
  `cd8a4e23561e413c9a6a165e4c553f975ec709f44ce47bba69be36afd9af07d4`.
- [Improvement persistence archive](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.67/kravhantering-production-deploy-0.7.0-preview.67.tar.gz):
  `506e80c9a2abc695d436e7b15036e6248d7734dd7bd8eedecf6d0f6947b25124`.
- [UBI source archive](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.71/kravhantering-production-deploy-0.7.0-preview.71.tar.gz):
  `fb681e7e8622001f9904ecd82572a4c262c005f041a3c113f14f90bd57a5a5e5`.

Published `release-metadata.json` binds each archive's release to its source
commit and digest-addressed image references. For the app-runtime image:

- [Improvement source metadata](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.66/release-metadata.json):
  `sha256:798b3baffab6b020a88f32150bab082fb20c3034be1e458d361b5d857f176825`.
- [Improvement persistence metadata](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.67/release-metadata.json):
  `sha256:88ab12456a7d6179a73e9cf8ab5ce27bf51806cfa24158244438402e785136eb`.
- [UBI source metadata](https://github.com/viscalyx/Kravhantering/releases/download/v0.7.0-preview.71/release-metadata.json):
  `sha256:814cf6107b0641396c36d57ba8a470d2b52700cd7ada06374da1d0916ad149f2`.

Thus the source and persistence previews are distinct published artifacts,
not merely two workflow entries for one digest. Registry promotion evidence
comes from the run's promotion output and metadata, not a fresh independent
registry pull. Release assets and bodies are mutable: the hashes above freeze
the downloaded archive observations, while source-code links use commit IDs.
This audit does not independently re-verify the Sigstore attestations.

## Ordinary prose and stable archival

[Record automatic duplicate requirement detection as out of scope](https://github.com/viscalyx/Kravhantering/pull/1403)
changes only `.out-of-scope/automatic-duplicate-requirement-detection.md` at
`ed74528055aaa34c6a13f5e99ad857fdeadec687`. Its
[Container Release run](https://github.com/viscalyx/Kravhantering/actions/runs/34465857912)
records `RELEASE_CREATE_GITHUB_RELEASE: false` and an empty release tag, yet
at 2026-09-10 11:09:47 UTC explicitly reports six images staged and twelve
image tags promoted and verified. The associated main push also runs quality,
build, integration, performance, API/MCP security, and repository security.
For example,
[the prose Build Check](https://github.com/viscalyx/Kravhantering/actions/runs/34465857642)
succeeds. This example is ordinary non-release prose under `.out-of-scope`,
not a claim that all `docs/` paths are equivalent.

Stable publication subsequently fetches **current main** and archives its
entire Unreleased note section under the stable version, then opens an archive
PR. It does not select note source markers from the stable source commit.
Stable publishing does not run the preview-only commit synchronization.
The archival PR's later main merge changes a release-relevant path. Sources:
[stable archival workflow](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/.github/workflows/container-release.yml#L830-L913),
[archival transformation](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/operator-upgrade-notes.mjs#L189-L235).

The historical
[archive operator upgrade notes for v0.6.0 PR](https://github.com/viscalyx/Kravhantering/pull/1219)
merges as `98025dbeb56b1885c4fce166403b9a8c6bf52484`. Its
[archive-merge release run](https://github.com/viscalyx/Kravhantering/actions/runs/33191178818)
records `v0.6.1-preview.1`, and
[that preview release](https://github.com/viscalyx/Kravhantering/releases/tag/v0.6.1-preview.1)
exists with publication time 2026-08-28 17:17:30 UTC. The run list also shows
the broad push checks. This corroborates archival-triggered publication;
its archive contents are not part of the three-archive content comparison.

## Failures, concurrency, reruns, and deployment limits

Code supports these constraints; the inspected runs do not supply production
examples of every failure mode:

- Failed/delayed lookup is tolerated by preview synchronization, with a timed
  API request and no retry. Tests cover timeout and source-marker behavior,
  not live GitHub eventual consistency. See
  [note lifecycle tests](https://github.com/viscalyx/Kravhantering/blob/c8b393b64300be7af7e1e5ee42b373cb29fc0d09/scripts/release/__tests__/operator-upgrade-notes.test.mjs).
- A later head may include earlier unpublished source changes, but relevance
  still uses the current push range and sync only its head association.
  Consequently, earlier unpersisted notes and failed-preview recovery need
  an explicit decision; current code does not prove completeness for them.
- Concurrent stable publication can archive notes from main newer than its
  tagged input. Separate release/persistence groups provide no shared cutoff.
  The two observed source/notes pairs overlap in time, but do not exercise
  every multiple-source-merge race.
- Reruns can edit an existing GitHub Release and upload assets with
  `--clobber`; they are not immutable no-op publication by construction.
  No rerun asset replacement is independently audited here. Publication and
  asset upload are separate operations, so a later failure can follow partial
  publication. Stable archival also follows publication and can fail after it.

These are deductions from the selection, sync, publication, and archival
sources above, not additional observed incidents. No release policy is chosen.

No checked-in workflow declares a release-event, `workflow_run`, or
`repository_dispatch` deployment trigger, and no deployment environment is
configured in those YAML files. The GitHub
[repository deployments endpoint](https://api.github.com/repos/viscalyx/Kravhantering/deployments?per_page=10)
returns an empty list during this audit. Candidate production-smoke activity
runs inside CI and is not evidence of an external environment rollout.
The read-only
[repository hooks endpoint](https://api.github.com/repos/viscalyx/Kravhantering/hooks)
exposes one active `web` hook, ID `602735223`, subscribed to all events (`*`).
The destination hostname is `api.reviewable.io`; URL paths, query parameters,
credentials, and other configuration are not exposed. Delivery payloads and
downstream behavior are not inspected. The
[repository environments endpoint](https://api.github.com/repos/viscalyx/Kravhantering/environments)
exposes only `copilot`, with no protection rules. Thus an external event
consumer exists, but these observations do not establish that it deploys.
Registry consumers and infrastructure outside this repository remain unknown;
absence of visible deployment records is not proof that no deployment occurs.

## Questions now sharp enough to decide

1. Which validation results must precede publication, and which can be reused
   across source and persistence commits without changing suite ownership?
2. What marks a completed publication, and what range supplies accumulated
   changes and required notes after failed, skipped, or superseded previews?
3. Which surfaces must deliver notes: GitHub Release body, deployment archive,
   or both; and what happens when note lookup cannot prove completeness?
4. How are persistence-only merges distinguished from substantive corrections,
   and which exact release input determines stable archival's source markers?
5. What is the rerun/recovery contract for existing releases and partial image
   promotion, and are external deployment consumers part of that contract?
