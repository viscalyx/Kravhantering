# CI gate failure history research note

Research date: 2026-08-16

## Decision summary

The available history does not support treating hosted-runner resource pressure
as the general explanation for either problematic gate.

- The container gate has eight confirmed `no space left on device` failures.
  They are a distinct, real hosted-runner disk-pressure class, but only eight
  of the 114 observed failing exact-job executions in the bounded failure-log
  census (7.0%).
- The Playwright gate has no explicit disk- or memory-exhaustion signature in
  its 92 observed failing exact-job executions. Build/dependency defects,
  test/API failures, shared-state collisions, and application rate limiting
  account for the visible signatures.
- The container gate has a separate runner-image/toolchain class. Twelve
  executions contain Podman inspection, `conmon`, journald, or incompatible OCI
  runtime signatures. This is infrastructure behavior, but it is not resource
  exhaustion.
- Failures are often late. The median observed failed Playwright job lasts
  735 seconds, and its test-stage failures have a median of 867 seconds. The
  container job's three production-stack verification failures last 1,338 to
  1,487 seconds.
- Thirty-two commit SHAs have both exact jobs fail from concurrently-started
  workflow runs. Twenty-eight pairs have the same immediately identifiable
  signature. A cross-workflow result can therefore report many failures
  together instead of presenting them as two independent discoveries.

These are historical observations, not a reliability service-level metric.
The GitHub API exposes complete workflow-run windows, but this investigation
downloads exact job metadata and logs only for workflows whose latest
conclusion is `failure`. A workflow whose latest rerun succeeds can contain an
older failed attempt not included in the 92 and 114 execution counts. The
counts are consequently reproducible lower bounds on failing attempts.

## Scope and method

The exact jobs are:

- `Canonical Playwright Gate (Prod-like, Pruned Dependencies)`, introduced by
  [the prod-like CI rework](https://github.com/viscalyx/Kravhantering/commit/1e3b0f57d083ce1a543232182f8896b8ee34af21)
  and currently defined in the
  [Integration Tests workflow](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/integration-tests.yml#L225-L410).
- `Build and Smoke Test Container Stack`, introduced by
  [the production release workflow](https://github.com/viscalyx/Kravhantering/commit/f28874c5d173ed2b14b3f6fa860da6c5bc05bc0e)
  and currently defined in the
  [Container PR Smoke workflow](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/container-pr-smoke.yml#L13-L479).

The run census uses every pull-request workflow run returned in each exact-job
era:

- Integration Tests: `created:2026-07-02..2026-08-16T17:52:00Z`, 707 runs.
- Container PR Smoke: `created:2026-05-23..2026-08-16T17:52:00Z`, 864 runs.

The census snapshot closes at 2026-08-16 17:52 UTC. Later state changes on an
already indexed run, including the completed PR 1042 container job cited
below, can supply case evidence without silently changing the snapshot counts.

For every workflow whose latest conclusion is `failure`, the investigation
loads `/actions/runs/{run_id}/jobs?filter=all`, selects the exact job name, and
downloads the failed job log. `filter=all` retains all attempts for those
latest-failure workflows. It does not make the failure-log census complete for
workflows whose latest attempt succeeds.

The workflow-run endpoints are the primary denominator sources:

- [Integration Tests pull-request runs](https://api.github.com/repos/viscalyx/Kravhantering/actions/workflows/integration-tests.yml/runs?event=pull_request&per_page=100&created=2026-07-02..2026-08-16T17%3A52%3A00Z)
- [Container PR Smoke pull-request runs](https://api.github.com/repos/viscalyx/Kravhantering/actions/workflows/container-pr-smoke.yml/runs?event=pull_request&per_page=100&created=2026-05-23..2026-08-16T17%3A52%3A00Z)

The API sometimes leaves `pull_requests` empty after branches or refs change.
The analysis therefore keys executions by immutable run ID, job ID, and
`head_sha`, not by inferred pull-request number.

## Run and exact-job census

<!-- markdownlint-disable MD013 -->
| Gate | Workflow runs | Workflow conclusions | Exact-job failures observed | Distinct workflow runs with an observed exact-job failure |
| --- | ---: | --- | ---: | ---: |
| Playwright | 707 | 489 success, 109 failure, 109 cancelled | 92 | 91 |
| Container | 864 | 444 success, 319 failure, 100 cancelled, 1 in progress at capture | 114 | 105 |
<!-- markdownlint-enable MD013 -->

The run-incidence lower bounds are therefore 91/707 (12.9%) for Playwright and
105/864 (12.2%) for the container gate. They are lower bounds because a
latest-success workflow rerun can hide an older failed attempt from this
per-run job selection.

The difference between executions and distinct workflow runs comes from
reruns retained by `filter=all`. Across the complete run records, four
Integration Tests runs have `run_attempt > 1`, adding four attempts. Sixteen
Container PR Smoke runs have `run_attempt > 1`, adding 20 attempts and reaching
attempt four. These are workflow reruns, not new pushes and not Playwright's
in-test retries.

### Fully expanded current-window attempt census

A focused census expands every exact-job attempt from 2026-08-10 00:00 UTC
through capture at 2026-08-16 17:52 UTC, including failures hidden behind a
later successful rerun. It is the reliable current-topology sample to use
alongside the broader lower-bound census:

<!-- markdownlint-disable MD013 -->
| Job | Successful | Failed | Cancelled | Completed attempts | Rerun attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canonical Playwright Gate (Prod-like, Pruned Dependencies) | 95 | 19 | 19 | 133 | 0 |
| Build and Smoke Test Container Stack | 69 | 44 | 30 | 143 | 12 |
<!-- markdownlint-enable MD013 -->

In this seven-day sample, unsuccessful Playwright attempts range from 31 to
1,009 seconds with a median of 882 seconds. Unsuccessful container attempts
range from 164 to 1,487 seconds with a median of 538 seconds. The longest three
container attempts all reach late release HSA verification in the production
stack. The sample's first-actionable-signal classification is:

<!-- markdownlint-disable MD013 -->
| Gate and class | Attempts |
| --- | ---: |
| Playwright: branch-owned behavior or assertion defect | 10 |
| Playwright: shared in-job state or rate limit | 5 |
| Playwright: setup, build, or configuration defect | 3 |
| Playwright: external service | 1 |
| Playwright: hosted-runner resource pressure | 0 |
| Container: branch-owned build, script, deployment, or product defect | 26 |
| Container: hosted-runner runtime or toolchain variation | 14 |
| Container: external registry or tool download | 3 |
| Container: repository tool setup | 1 |
<!-- markdownlint-enable MD013 -->

This complete current-window view and the full-era lower bound answer different
questions. The focused view preserves rerun outcomes and supports an exclusive
classification. The broad view shows that the same stage and signature
families recur across the gates' available lifetime.

Cancelled workflows are not counted as named-job failures. Both workflows use
`cancel-in-progress: true`, so a new push can replace an older in-flight run;
the run-level result alone cannot distinguish every replacement from a manual
or infrastructure cancellation. See the
[Integration concurrency declaration](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/integration-tests.yml#L7-L9)
and the
[container concurrency declaration](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/container-pr-smoke.yml#L7-L9).

## Failing stages and runtimes

Runtime is wall time from exact-job `started_at` to `completed_at`, including
the workflow's evidence and cleanup steps.

### Playwright gate

<!-- markdownlint-disable MD013 -->
| Failed stage | Executions | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Run Playwright tests against pruned prod-like server | 57 | 286 s | 867 s | 1,009 s |
| Build prod-like bundle (full deps) | 31 | 165 s | 194 s | 279 s |
| Check integration chunk manifest, plus cleanup failure | 2 | 26 s | 29 s | 29 s |
| Start local database service | 1 | 31 s | 31 s | 31 s |
| Setup Node.js, plus cleanup failures | 1 | 8 s | 8 s | 8 s |
<!-- markdownlint-enable MD013 -->

Across all 92 observed failures, minimum/median/90th-percentile/maximum are
8/735/917/1,009 seconds. The 31 build failures split cleanly into 17 missing
TypeScript dev-dependency failures, ten TypeScript 7/Next.js compiler-API
incompatibilities, and four client-bundle budget regressions. Representative
evidence is the
[missing-TypeScript failure](https://github.com/viscalyx/Kravhantering/actions/runs/29445846181/job/87455984565),
[TypeScript 7 incompatibility](https://github.com/viscalyx/Kravhantering/actions/runs/30758795531/job/91525541315),
and
[bundle-budget failure](https://github.com/viscalyx/Kravhantering/actions/runs/31891734294/job/95028898349).

The two manifest failures report that the generated chunk manifest differs
from the committed artifact, for example
[job 86232507490](https://github.com/viscalyx/Kravhantering/actions/runs/29051333604/job/86232507490).
The database-start singleton is an external registry connection reset while
pulling SQL Server, not product behavior or runner exhaustion:
[job 94696929127](https://github.com/viscalyx/Kravhantering/actions/runs/31777838500/job/94696929127).

### Container gate

<!-- markdownlint-disable MD013 -->
| Failed stage | Executions | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Install production archive with rootless Quadlet | 38 | 397 s | 571 s | 1,281 s |
| Build app-runtime image or candidate | 32 | 111 s | 247 s | 485 s |
| Start container stack | 13 | 274 s | 616 s | 850 s |
| Install container runtime tools | 7 | 195 s | 230 s | 573 s |
| Verify OCI archives | 6 | 325 s | 358 s | 402 s |
| Build db-job candidate | 3 | 290 s | 293 s | 304 s |
| Verify production stack | 3 | 1,338 s | 1,409 s | 1,487 s |
| Preflight rootless Podman journald logging | 3 | 164 s | 192 s | 222 s |
| Run release smoke tests | 2 | 357 s | 779 s | 779 s |
| Gate images against vulnerability policy | 2 | 338 s | 527 s | 527 s |
| Export OCI archives | 2 | 333 s | 596 s | 596 s |
| Setup Node.js | 1 | 138 s | 138 s | 138 s |
| Prepare Docker Buildx builder | 1 | 193 s | 193 s | 193 s |
| Create per-container local env files | 1 | 474 s | 474 s | 474 s |
<!-- markdownlint-enable MD013 -->

One of the 38 archive-install executions also fails its always-run removal
step. Across all 114 observed failures,
minimum/median/90th-percentile/maximum are 111/397/777/1,487 seconds.

The 35 image-build failures expose ordinary build defects: 14 missing
TypeScript dependency, ten TypeScript 7 incompatibility, two bundle-budget,
two missing `expo-sqlite`, one shell-syntax, and five missing-module TypeScript
signatures. Some signatures overlap within a log. Representative primary
evidence includes
[missing `expo-sqlite`](https://github.com/viscalyx/Kravhantering/actions/runs/26367642783/job/77614127897),
[the container TypeScript 7 failure](https://github.com/viscalyx/Kravhantering/actions/runs/30758795551/job/91525541343),
and a
[missing-module candidate failure](https://github.com/viscalyx/Kravhantering/actions/runs/31891734420/job/95028898449).

## Failure-mode classification

### Hosted-runner resource pressure

Eight container executions have an actionable `no space left on device` in
the step that determines the job failure. They are not matches from the
workflow's intentional negative tests or diagnostic text:

<!-- markdownlint-disable MD013 -->
| Failed step | Immutable job evidence |
| --- | --- |
| Verify OCI archives | [78908290226](https://github.com/viscalyx/Kravhantering/actions/runs/26770473930/job/78908290226), [78317871929](https://github.com/viscalyx/Kravhantering/actions/runs/26582153918/job/78317871929), [78125549806](https://github.com/viscalyx/Kravhantering/actions/runs/26524833385/job/78125549806), [78014730006](https://github.com/viscalyx/Kravhantering/actions/runs/26493034689/job/78014730006), [78919704227](https://github.com/viscalyx/Kravhantering/actions/runs/26773733157/job/78919704227), [78915574499](https://github.com/viscalyx/Kravhantering/actions/runs/26772560384/job/78915574499) |
| Export OCI archives | [78921734529](https://github.com/viscalyx/Kravhantering/actions/runs/26774309333/job/78921734529) |
| Start container stack | [87155363426](https://github.com/viscalyx/Kravhantering/actions/runs/29353520986/job/87155363426) |
<!-- markdownlint-enable MD013 -->

Six archive-verification jobs fail while writing or creating image layers, the
export job fails writing `/var/tmp/container_images_*`, and the stack-start job
fails while writing blobs/layers. No observed exact-job log has a supported
out-of-memory failure.

### Runner image and unrelated infrastructure

Twelve container executions contain Podman inspection, `conmon`, journald, or
OCI-runtime incompatibility signatures. Examples include
[a `conmon_missing_journald` preflight](https://github.com/viscalyx/Kravhantering/actions/runs/31705938742/job/94466396680)
and
[a Podman inspection timeout](https://github.com/viscalyx/Kravhantering/actions/runs/31633889088/job/94386845745).

The fully expanded seven-day census counts 14 runner/toolchain attempts because
it also includes failed attempts hidden behind a later non-failure workflow
conclusion. The full-era latest-failure job expansion observes 12. This
difference is another reason to keep the complete current sample separate from
the broad lower bound.

[The runner hardening investigation](https://github.com/viscalyx/Kravhantering/issues/982)
provides the strongest controlled case. Container run 31507094670 has
[a failed attempt](https://github.com/viscalyx/Kravhantering/actions/runs/31507094670/job/93831483112)
and
[a successful rerun](https://github.com/viscalyx/Kravhantering/actions/runs/31507094670/job/93845146992)
on the same commit. Its captured peak is about 9.7 MB with about 4.3 GB
available and no OOM evidence. The failure belongs to runner-image
Podman/`conmon` provenance, not hosted capacity pressure.

External infrastructure also appears independently: the Playwright database
start can fail on a Microsoft Container Registry reset, and the container
Buildx bootstrap can fail on a Docker Hub deadline, as in
[job 89675699623](https://github.com/viscalyx/Kravhantering/actions/runs/30156702639/job/89675699623).

### Product, setup, shared state, rate limits, and flaky-shaped assertions

The 57 Playwright test-stage failures have several visible, partly overlapping
signatures:

- Five jobs contain HSA verification `429 Too Many Requests`; this is
  application rate limiting, not an external provider response, because the
  job starts the repository's local HSA fixture. Example:
  [job 95188881030](https://github.com/viscalyx/Kravhantering/actions/runs/31956935158/job/95188881030).
- Three jobs contain `Ambiguous deviation target`, a direct shared-database
  fixture collision. Example:
  [job 87924915605](https://github.com/viscalyx/Kravhantering/actions/runs/29592540763/job/87924915605).
- One job fails global authentication setup with a Keycloak-backed login
  returning 400. The same SHA also fails container release-smoke authentication:
  [Playwright job 94841812212](https://github.com/viscalyx/Kravhantering/actions/runs/31823419289/job/94841812212)
  and
  [container job 94841812768](https://github.com/viscalyx/Kravhantering/actions/runs/31823419370/job/94841812768).
- Forty-seven jobs contain locator/page expectation failures, pointer
  hit-testing errors, or Playwright timeouts. Eleven contain explicit 400/404/
  409, MCP, or type-contract mismatches. These sets overlap. The former are
  flaky-shaped, while the latter are stronger product-regression evidence, but
  log shape alone cannot prove flakiness.

Fifty-six of the 57 test-stage failures reach `Retry #2`, so the configured two
in-test retries are already exhausted before the job fails. This is separate
from a GitHub workflow rerun and from a new commit push. No same-SHA successful
workflow run exists in the bounded latest-failure set for these 57 jobs, so a
claim that any particular assertion failure is purely flaky needs more
evidence.

## Locally green changes, revisions, and retries

The available PR metadata supports a lower bound, not a population rate.
[PR 1042](https://github.com/viscalyx/Kravhantering/pull/1042) explicitly says
that `npm run check`, focused SQL Server tests, and the focused AUTHZ-11
Playwright scenario are green locally. Three distinct CI revisions then fail
the exact Playwright job on the same HSA 429 after both in-test retries:

<!-- markdownlint-disable MD013 -->
| Commit | Job | Reported test-stage runtime |
| --- | --- | ---: |
| `6b70b2caed796e2a3418d6968f79866213edcfca` | [95183911127](https://github.com/viscalyx/Kravhantering/actions/runs/31954893334/job/95183911127) | 607 s |
| `4f306845271d00d6f3be0da1e54cc2780169d15f` | [95186692565](https://github.com/viscalyx/Kravhantering/actions/runs/31956030140/job/95186692565) | 626 s |
| `f83e9ef6e63b20ec77ac9d4f406bf303d72a5520` | [95188881030](https://github.com/viscalyx/Kravhantering/actions/runs/31956935158/job/95188881030) | 627 s |
<!-- markdownlint-enable MD013 -->

The pull request contains five commits in total. The targeted stabilization on
`d2178cf0e11be6d96fa7425f8c66299d6114c2c3` produces
[a successful Playwright job](https://github.com/viscalyx/Kravhantering/actions/runs/31961988754/job/95201209735)
and
[a successful container job](https://github.com/viscalyx/Kravhantering/actions/runs/31961988937/job/95201210051).
Thus the explicit locally-green evidence set is one inspected PR, and that one
PR requires multiple CI revisions. It is valid as a concrete occurrence and
invalid as an estimate of how often all locally-green changes need revisions.

Other PR histories quantify repeated CI revisions without claiming local-green
status:

- [Enable intent-driven requirement detail prefetching](https://github.com/viscalyx/Kravhantering/pull/1040)
  contains 12 commits and eight successive Playwright failures in one
  requirement-library interaction family. On revision `6765aa5`, the
  [Playwright gate succeeds](https://github.com/viscalyx/Kravhantering/actions/runs/31952664837)
  while the
  [container gate first exposes a missing build-context helper](https://github.com/viscalyx/Kravhantering/actions/runs/31952664982/job/95178575477).
  The next revision makes both gates green.
- [Require time-bounded isolated storage for AI forensic evidence](https://github.com/viscalyx/Kravhantering/pull/1024)
  contains six commits. Four revisions expose missing container build-context
  dependencies, and a later revision reaches an independent Playwright Admin
  Center timeout.
- [Bind MCP bearers to approved short-lived service tokens](https://github.com/viscalyx/Kravhantering/pull/1002)
  contains seven commits. One revision reports the same authentication 400 in
  both exact jobs; a later revision exposes a missing MCP client identifier in
  the Playwright path.
- [Constrain HSA OAuth and lookup destinations](https://github.com/viscalyx/Kravhantering/pull/989)
  contains 12 commits. Three late container attempts, each 22 to 25 minutes,
  report the same release HSA verification contract failure.
- [Sanitize Nginx logs and establish a trusted client-IP boundary](https://github.com/viscalyx/Kravhantering/pull/984)
  contains nine commits. Four container attempts report the same unbound shell
  variable while other attempts expose runtime-bootstrap or diagnostics
  behavior.

These series quantify repeated revisions on concrete changes: eight
consecutive Playwright failures on one 12-commit PR, four container
build-context failures on one six-commit PR, and three late container failures
on another 12-commit PR. They remain separate from the only explicitly
locally-green case above.

Repeated-push counts also cannot be reconstructed from `run_attempt`: a rerun
retains one run ID and increments `run_attempt`, while a push produces a new
run and SHA. PR 1042 demonstrates the latter; issue 982 demonstrates the
former.

## Which failures can be reported together

Thirty-two SHAs have both exact jobs fail. In every pair, the workflow runs
start in the same second. The paired signatures are:

<!-- markdownlint-disable MD013 -->
| Pair signature | SHAs |
| --- | ---: |
| Missing TypeScript + missing TypeScript | 14 |
| TypeScript 7 incompatibility + TypeScript 7 incompatibility | 10 |
| Bundle budget + bundle budget | 2 |
| Node engine mismatch + Node engine mismatch | 1 |
| Authentication setup 400 + authentication setup 400 | 1 |
| Different immediately visible signatures | 4 |
<!-- markdownlint-enable MD013 -->

All 32 pairs can be presented in one per-revision summary after both jobs
finish. Twenty-eight can additionally be deduplicated under one shared root
signature while retaining both job links. The four different-signature pairs
still benefit from one summary because both failures already coexist on the
same revision.

Within the Playwright step, the chunk runner intentionally continues through
all planned chunks, accumulates `failedChunks`, merges their reports, and only
then returns failure. See
[`runChunked`](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/tests/integration-chunks.mjs#L1089-L1196).
Ten of the 57 test-stage failures report more than one failed chunk, so those
failures are already technically available for one consolidated report.

Ordinary workflow steps are serial and stop after failure. Only explicitly
always-run evidence, artifact, and cleanup steps continue, as shown in the
[Playwright workflow tail](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/integration-tests.yml#L360-L410)
and
[container workflow tail](https://github.com/viscalyx/Kravhantering/blob/f6d19743047d2740d371188b4631154bdfd946ae/.github/workflows/container-pr-smoke.yml#L375-L479).
Therefore a single job cannot currently report ordinary downstream-stage
defects that it never executes. Cross-workflow aggregation and the
continue-all-chunks Playwright design can report known concurrent failures;
discovering later serial-stage failures requires a different execution model.

## Decision implications

- Preserve the behavior coverage. Most failures correspond to real product,
  package, deployment, or fixture contracts; the evidence favors simplifying
  execution and responsibility rather than removing integration testing.
- Make global prerequisites fail fast while retaining co-reporting for
  independent chunks. Continuing after a broken authentication setup only
  repeats one root failure; continuing after an isolated test failure can
  expose useful independent results.
- Treat the container gate as the main topology candidate. One serial runner
  owns runtime setup, five image builds, vulnerability scanning, packaging,
  installation, SQL recovery, security boundaries, authentication, and browser
  smoke. Its fail-fast chain both suppresses downstream defects and makes the
  latest failures cost 22 to 25 minutes.
- Do not add a second local workflow or infer that the working development loop
  needs a mandatory heavyweight preflight. The explicit local-green case and
  same-SHA rerun instead point to CI fixture lifetime, ordering, and runner
  provenance.
- Treat hosted-runner resource variability narrowly. Eight disk failures are
  real, while Podman timeouts and toolchain changes remain a separate class
  unless OOM, cgroup, pressure, or equivalent diagnostics support a capacity
  claim.

## Evidence limitations

- Exact-job failure counts are lower bounds. The job-and-log expansion covers
  every workflow whose latest conclusion is `failure`, but not a failed first
  attempt hidden by a later successful or cancelled whole-workflow attempt.
- Cancelled runs can contain an undiscovered defect beyond their cancellation
  point. They remain in the workflow census but outside failure-mode counts.
- GitHub records workflow reruns and pushes, not the developer's local command
  history or reason for each push. PR 1042 supplies one explicit local-green
  case; it cannot establish a repository-wide frequency.
- Signature sets overlap. A job can contain both an API contract failure and a
  later assertion timeout, so category counts are evidence signals rather than
  a mutually exclusive lifetime distribution. Stage counts use the first
  actionable non-cleanup failure.
- A timeout or runner-image change alone is not proof of CPU, memory, or disk
  pressure. Resource classification requires an explicit OOM, `no space left
  on device`, cgroup, or equivalent diagnostic in the actionable failure
  context.

## Reproduction queries

The census uses these command shapes. Pagination is necessary; the Actions API
caps broad unfiltered history responses.

```bash
gh api --paginate -X GET \
  'repos/viscalyx/Kravhantering/actions/workflows/integration-tests.yml/runs' \
  -f event=pull_request -f per_page=100 \
  -f created='2026-07-02..2026-08-16T17:52:00Z'

gh api --paginate -X GET \
  'repos/viscalyx/Kravhantering/actions/workflows/container-pr-smoke.yml/runs' \
  -f event=pull_request -f per_page=100 \
  -f created='2026-05-23..2026-08-16T17:52:00Z'

gh api \
  'repos/viscalyx/Kravhantering/actions/runs/{run_id}/jobs?filter=all&per_page=100'

gh api --allow-escape-sequences \
  'repos/viscalyx/Kravhantering/actions/jobs/{job_id}/logs'
```

Classification counts use exact failing-step names from the jobs response,
wall-clock timestamps from the job object, and error signatures from the
immutable job log. SHA overlap joins each workflow run's `head_sha`; no title,
branch name, or commit-message inference determines the category.
