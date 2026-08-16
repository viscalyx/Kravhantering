# CI gate failure history research

## Question and scope

This research classifies pull-request history for exactly these two jobs:

- **Canonical Playwright Gate (Prod-like, Pruned Dependencies)**
- **Build and Smoke Test Container Stack**

The census covers completed job attempts whose workflow run starts from
2026-08-10 00:00 UTC through 2026-08-16 23:59 UTC. This window includes the
current container-runtime investigation and retains usable GitHub logs and
artifacts. The census uses the GitHub Actions jobs API with `filter=all`, so an
unsuccessful first attempt remains counted when a rerun of the same workflow
turns green. One in-progress run at collection time is excluded.

The evidence is GitHub-hosted run metadata, job logs, JUnit reports, pull
request revision history, and the workflows at commit
`5c4585fb26a831b71b2f527243cd849bc08e3b58`. GitHub has no record of local test
commands, so the “locally green” part of the question cannot be quantified
from this history.

## Result

The evidence does not support general CPU or memory scarcity as the main
failure cause. It supports two different problems:

1. The Playwright gate mostly exposes branch-owned behavior defects and a
   deterministic HSA rate-limit interaction inside its own long, shared test
   session.
2. The container gate combines build, supply-chain, packaging, installation,
   database, service, security-boundary, and browser checks in one sequential
   job. It therefore exposes useful defects, but often only after substantial
   work and across several revisions. GitHub-hosted runner variation is also
   real here, but the strongest case concerns conflicting preinstalled
   Podman/conmon provenance rather than insufficient compute resources.

The integration coverage itself is not the demonstrated problem. The
strongest simplification target is gate execution: make deterministic setup
and artifact-contract failures earlier and independently visible, remove
duplicate or accidental state coupling, and keep production-stack behavior
coverage explicit.

## Census

<!-- markdownlint-disable MD013 -->
| Job | Successful | Failed | Cancelled | Completed attempts | Rerun attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canonical Playwright Gate (Prod-like, Pruned Dependencies) | 95 | 19 | 19 | 133 | 0 |
| Build and Smoke Test Container Stack | 69 | 44 | 30 | 143 | 12 |
<!-- markdownlint-enable MD013 -->

Cancelled attempts are reported separately because the workflows use
`cancel-in-progress: true`; a new push commonly cancels an older revision.
They do not establish a test defect. For the container gate, querying only the
latest attempt hides ten completed attempts that `filter=all` exposes. This is
why the ordinary workflow view understates the fix-run cycle.

Unsuccessful Playwright attempts range from 31 seconds to 16 minutes 49
seconds, with a median of 14 minutes 42 seconds. The 31-second case is an
external SQL Server image-pull reset; failures that reach browser assertions
usually consume nearly the full normal job time. Unsuccessful container
attempts range from 2 minutes 44 seconds to 24 minutes 47 seconds, with a
median of 8 minutes 58 seconds. The longest three all reach the late release
HSA verification in the production stack.

## Failure classification

Classification follows the first actionable failing signal in the job log,
not incidental error text in cleanup or in intentional negative tests.

### Canonical Playwright Gate

<!-- markdownlint-disable MD013 -->
| Class | Attempts | Evidence |
| --- | ---: | --- |
| Branch-owned behavior or assertion defect | 10 | Eight successive requirement-library interaction failures on [Enable intent-driven requirement detail prefetching][pr-prefetch], one admin-entrypoint timeout, and one deterministic duplicate-download assertion |
| Shared in-job state / rate limit | 5 | HSA verification returns HTTP 429 with 9–16 second retry guidance on two branches; Playwright immediately retries the test and consumes the remaining allowance again |
| Setup, build, or configuration defect | 3 | One production build failure, one missing MCP client identifier, and one authentication setup response of HTTP 400 that leaves every later chunk without storage state |
| External service | 1 | Microsoft Container Registry resets the SQL Server image download |
| Hosted-runner resource pressure | 0 | No OOM, ENOSPC, runner-lost, or resource diagnostic is the actionable failure |
| Isolated flaky assertion | 0 | No assertion failure in the window becomes green by rerunning the identical SHA without a code or state change |
<!-- markdownlint-enable MD013 -->

The five rate-limit failures are not random timing flakes. For example, the
[latest affected job][playwright-hsa-429] reports
`hsa_verification_throttled`, supplies `retryAfterSeconds`, and shows retries
before the stated delay expires. The same signature occurs in three revisions
of one pull request and two revisions of another. The job owns the HSA fixture
and runs all 15 manifest chunks serially with one worker, while preserving the
same server and fixture for the whole run. The
[workflow][integration-workflow], [Playwright configuration][playwright-config],
and [chunk runner][chunk-runner] make that state lifetime explicit.

The branch-owned failures are also repeatable rather than resource-shaped.
The [first requirement prefetch failure][playwright-prefetch-first] and
[eighth requirement prefetch failure][playwright-prefetch-eighth] move from
hover/clickability timeouts to a more precise hit-test and attribute contract
as the branch changes. Each attempt exhausts Playwright retries on the same
interaction. The retries add time and diagnostic evidence, but do not repair
the underlying behavior.

The authentication-setup case shows a noise-amplification problem. After
[global authentication setup returns HTTP 400][playwright-auth-setup], the
chunk runner continues through the remaining chunks, which then report the
same missing storage-state prerequisite. Continuing after an independent test
failure is useful; continuing after a global prerequisite fails is not.

### Build and Smoke Test Container Stack

<!-- markdownlint-disable MD013 -->
| Class | Attempts | Evidence |
| --- | ---: | --- |
| Branch-owned build, script, deployment-contract, or product defect | 26 | Missing build-context files, shell defects, stack readiness failures, authentication/HSA contract failures, SQL recovery failures, file permissions, and capability assertions |
| Hosted-runner runtime or toolchain variation | 14 | Podman hangs, incompatible Quadlet availability, and Podman/conmon journald mismatches |
| External registry or tool download | 3 | Two Grype installation/download failures and one Docker registry HTTP 500 |
| Repository tool setup | 1 | The repository requires npm 12 while setup leaves npm 10 active |
| Shared-state leakage, rate limit, or flaky browser assertion | 0 | None is the first actionable container-job failure in the window |
<!-- markdownlint-enable MD013 -->

The runner-sensitive class needs a narrower interpretation than “the runner
lacks resources.” [Make container smoke runs deterministic and capture runner
diagnostics][runtime-issue] records the strongest controlled comparison: one
attempt selects `/usr/local/bin/podman` 5.8.4 and a conmon binary without
journald support, while an identical-SHA rerun on another runner image selects
the packaged Podman 4.9.3/conmon 2.1.10 pair and passes. The failing attempt
still has about 4.3 GiB available and the service peak is about 9.7 MiB. That
evidence rules out OOM for this incident and identifies runtime provenance.

Seven other attempts hang while inspecting or bootstrapping Podman, six show
the same conmon journald incompatibility, and one cannot obtain a compatible
Quadlet generator. These are reasonable runner/toolchain classifications, but
their logs do not prove CPU or memory exhaustion. No classified failure
contains a host or cgroup OOM kill. `No space left on device` output also
cannot be counted mechanically: the production smoke intentionally attempts
to overfill a bounded tmpfs and expects that write to fail as a security
check, as shown by the [production-smoke implementation][production-smoke].

The current [container workflow][container-workflow] explains both runtime and
late surfacing. One runner sequentially:

1. removes preinstalled toolchains and bootstraps container runtimes;
2. installs Node and Playwright dependencies;
3. builds five OCI candidates;
4. scans the candidates against vulnerability policy;
5. creates and installs a production deployment archive;
6. verifies OCI archives, SQL setup/recovery, Quadlet services, security
   boundaries, restart behavior, authentication, and browser release smoke;
7. gathers multiple diagnostic and artifact families.

This breadth is valuable as production evidence, but it creates a single
fail-fast chain. A missing file in the second image build prevents all later
images and every production smoke check from reporting. Conversely, an HSA
contract mismatch appears only after 22–25 minutes and all preceding builds,
scans, packaging, and installation succeed.

## Repeated revisions and late-surfacing failures

The history quantifies repeated CI revisions, but not whether each revision is
locally green.

- [Enable intent-driven requirement detail prefetching][pr-prefetch] contains
  12 commits. Eight successive revisions fail the Playwright gate on the same
  requirement-library interaction family. On revision `6765aa5`, the
  [Playwright gate is green][prefetch-playwright-green] while the
  [container gate newly reports][prefetch-container-fail] a missing build
  context helper. The next revision makes both gates green. This is direct
  evidence of a failure surfacing after the other named gate clears.
- [Require time-bounded isolated storage for AI forensic evidence][pr-forensic]
  contains six commits. Four revisions expose missing container build-context
  dependencies; a later revision reaches an independent Playwright admin
  entrypoint timeout. Build-context completeness is deterministic and can be
  reported much earlier than a full stack installation.
- [Bind MCP bearers to approved short-lived service tokens][pr-mcp] contains
  seven commits. One revision reports the same authentication HTTP 400 through
  both the prod-like Playwright setup and the release browser smoke. These two
  signals are co-reportable evidence of one configuration/authentication
  problem, not two independent reasons for another revision. A later revision
  exposes a missing MCP client identifier only in the focused Playwright path.
- [Constrain HSA OAuth and lookup destinations][pr-hsa] contains 12 commits.
  Three late container attempts, each 22–25 minutes, report the same release
  HSA verification contract failure. The normal prod-like Playwright gate is
  green on surrounding revisions because it does not exercise the installed
  production topology.
- [Sanitize Nginx logs and establish a trusted client-IP boundary][pr-nginx]
  contains nine commits. Four container attempts report the same unbound shell
  variable while other attempts expose runtime bootstrap or diagnostics
  behavior. This sequence shows that complexity added to diagnose the gate can
  itself become branch-owned gate work.

The histories therefore support “many CI revisions” for concrete pull
requests: eight consecutive Playwright failures on one 12-commit change, four
container build-context failures on one six-commit change, and three late
container HSA failures on one 12-commit change. They do not support a global
percentage of locally green pull requests because no local-run telemetry
exists.

## Implications for the planning map

These findings constrain later design work without prescribing an
implementation:

- Preserve the behavior coverage. Most failures correspond to real product,
  package, deployment, or test-fixture contracts.
- Treat general hosted-runner resource scarcity as unproven. The confirmed
  hosted-runner incident is runtime provenance; additional Podman hangs need
  the same kind of evidence before they are called CPU or memory failures.
- Fix ordering and responsibility before adding more test modes. Deterministic
  repository setup and build-context contracts should not require the full
  production-stack path to become visible.
- Keep global prerequisites fail-fast. Authentication setup and fixture
  availability are not independent chunk results.
- Keep independent behavior failures co-reportable where it is simple. The
  current Playwright chunk runner already continues after an individual chunk;
  this is useful once global prerequisites are healthy.
- View the container job as the main topology candidate. It spans several
  independently actionable domains and its late checks cost up to 25 minutes.
  A split is justified only if it reduces the branch-visible contract and
  avoids rebuilding or transferring the same large artifacts in more places.
- Do not add a second local workflow or mandatory heavy preflight. The history
  identifies CI ordering, fixture lifetime, and production-runtime provenance
  problems; it does not show that the working development loop needs more
  modes.

## Evidence limits

- GitHub Actions records CI attempts, not local runs or the developer's reason
  for each push.
- Cancelled runs may contain undiscovered failures after the cancellation
  point, so they remain outside failure classification.
- A Podman timeout is runner-sensitive evidence, but without OOM, scheduler,
  or disk diagnostics it is not proof of compute scarcity.
- The seven-day window is a dense, current sample rather than a lifetime
  reliability rate. Older workflow topology differs enough that combining it
  would blur the question about the current gates.

[chunk-runner]: https://github.com/viscalyx/Kravhantering/blob/5c4585fb26a831b71b2f527243cd849bc08e3b58/tests/integration-chunks.mjs#L1080-L1160
[container-workflow]: https://github.com/viscalyx/Kravhantering/blob/5c4585fb26a831b71b2f527243cd849bc08e3b58/.github/workflows/container-pr-smoke.yml#L12-L475
[integration-workflow]: https://github.com/viscalyx/Kravhantering/blob/5c4585fb26a831b71b2f527243cd849bc08e3b58/.github/workflows/integration-tests.yml#L226-L397
[playwright-config]: https://github.com/viscalyx/Kravhantering/blob/5c4585fb26a831b71b2f527243cd849bc08e3b58/playwright.prodlike.config.ts#L42-L78
[production-smoke]: https://github.com/viscalyx/Kravhantering/blob/5c4585fb26a831b71b2f527243cd849bc08e3b58/scripts/containers/production-smoke.sh#L1460-L1519
[runtime-issue]: https://github.com/viscalyx/Kravhantering/issues/982
[playwright-hsa-429]: https://github.com/viscalyx/Kravhantering/actions/runs/31956935158/job/95188881030
[playwright-prefetch-first]: https://github.com/viscalyx/Kravhantering/actions/runs/31945936666/job/95161765651
[playwright-prefetch-eighth]: https://github.com/viscalyx/Kravhantering/actions/runs/31956799375/job/95188558600
[playwright-auth-setup]: https://github.com/viscalyx/Kravhantering/actions/runs/31823419289/job/94841812212
[pr-prefetch]: https://github.com/viscalyx/Kravhantering/pull/1040
[pr-forensic]: https://github.com/viscalyx/Kravhantering/pull/1024
[pr-mcp]: https://github.com/viscalyx/Kravhantering/pull/1002
[pr-hsa]: https://github.com/viscalyx/Kravhantering/pull/989
[pr-nginx]: https://github.com/viscalyx/Kravhantering/pull/984
[prefetch-playwright-green]: https://github.com/viscalyx/Kravhantering/actions/runs/31952664837
[prefetch-container-fail]: https://github.com/viscalyx/Kravhantering/actions/runs/31952664982/job/95178575477
