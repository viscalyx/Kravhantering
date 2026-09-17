# CI integration ownership

Contributors use this guide to choose test coverage and diagnose required CI
results. Repository owners use it to configure branch protection.

Each required result reports for the same commit.
[Shared event/path selection](ci-selection.md) selects complete owners and
explains native exclusions. Required reporting rejects failed, cancelled,
missing or unexpectedly skipped selected work. Browser chunks
share a fresh seeded database and Keycloak, restart the development application
between chunks, retain each chunk's artifacts, and continue after failures.
The final browser result fails if any chunk fails. Services use bounded
readiness polling; both integration results and PR assembly use zero test
retries and retain traces, screenshots, and video from the first failure.

## Required results

The repository owner configures these exact branch-protection contexts after
they appear on the pull request and before merging:

- `Pruned Runtime Contract`
- `Browser Functional Integration`
- `Candidate Build and Vulnerability Policy (app-runtime)`
- `Candidate Build and Vulnerability Policy (db-job)`
- `Candidate Build and Vulnerability Policy (demo-seed)`
- `Candidate Build and Vulnerability Policy (HSA directory mock)`
- `Candidate Build and Vulnerability Policy (HSA person lookup adapter)`
- `Production Assembly Acceptance`

Other required contexts retain their names. Automation does not change branch
protection.

Use the reporting names above for branch protection, without the
`(execution)` suffix. In
[Container PR Smoke](../../.github/workflows/container-pr-smoke.yml), each
candidate reporting context reads its matrix's aggregate execution result.
One failed core child therefore fails both core candidate reporting contexts;
one failed support child fails all three support reporting contexts. Inspect
the individual execution jobs and their candidate evidence to find the cause.

The `HSA mTLS topology required` result in Container PR Smoke owns transport,
isolation, and certificate rotation. It consumes the HSA mock and adapter
candidates. Support-policy failure does not suppress available transport
evidence; the HSA result depends on its own build, topology, and rotation
outcomes.

## Integration coverage policy

`Pruned Runtime Contract` owns six fixed specifications:
report authorization boundaries, authentication login, authentication security,
platform smoke, platform error-boundary smoke, and native CSP delivery.
The [manifest validator](../../tests/integration-chunks.mjs)
checks their presence before any owned service starts. The suite tests a
production standalone build outside repository dependency ancestry, so only
its traced dependencies can resolve. It runs with one Chromium worker,
SQL Server, and real Keycloak. Stored sessions are limited to admin and
no-role users; anonymous login exercises the real OIDC redirect chain.
The real bounded PDF and CSV export path belongs to this owner.

`Browser Functional Integration` uses `npm run test:integration` in development
mode. It owns browser navigation, downloads, focus, keyboard and pointer
behavior, layout, and mutations spanning UI, authorization, and persistence.
The visible role matrix remains here. Ordinary business journeys use desktop
Chromium at 1440 × 1200 once. Use `DESKTOP_VIEWPORT` from
`tests/helpers/desktop-viewport.ts` for desktop scenarios. Keep explicit mobile
and constrained-height dimensions when testing
responsive boundaries, and avoid duplicating whole business journeys solely
for a different viewport.

Owned chunk runs obtain fresh role sessions before every chunk so long runs do
not reuse an expiring login. External-server runs refresh sessions only when
`PLAYWRIGHT_FORCE_AUTH_SETUP=1` is explicitly selected.

The [scheduled isolated-chunk workflow](../../.github/workflows/integration-isolation-weekly.yml)
uses the same browser-functional manifest
with a fresh runner and seed per chunk. It complements the shared-database PR
run. Developer Mode retains its dedicated dev-server smoke. Security MCP is the
sole owner of the seeded MCP scan, outside both integration results.

Focused tests run in `quality-checks` (the Quality Checks workflow) or
`SQL Server Invariants`. They own deterministic permutations, database
constraints, transactions, rollback, and concurrency. Use these suites for
those risks while keeping user-visible workflows in browser coverage.

Manual cases remain in [the manual test catalog](../governance/manuella-testfall.md).
Their ownership notes distinguish browser steps from focused permutations.
Desktop executions own functional coverage; responsive checks own the
separate viewport risks.

## Candidate and assembly boundaries

Two core matrix children build app-runtime and db-job; three support children
build demo-seed and the HSA directory mock and lookup adapter. Both matrices
have fail-fast disabled. Each child builds once, records Buildx manifest and
image identities and an archive checksum, produces an SBOM, evaluates the
committed vulnerability policy, and uploads candidate and evidence together.
A single-candidate policy checks stale exceptions for that candidate; complete
release evaluation still checks the complete release set. Build, scanner/tool,
and vulnerability-policy outcomes remain distinguishable in retained evidence
and job summaries.

If a candidate upload fails during finalization, rerun the failed producer and
dependent jobs; a successful image build does not mean its artifact is
available.

Assembly depends only on the core matrix, so support-candidate failures do not
block it. It installs the production deployment archive using the exact core
candidate images in rootless Podman with Quadlet. Acceptance covers migrations,
required seed, bundled assets, embedded build metadata, and creating and reading
a requirement through nginx over HTTPS. It also checks container containment:
networks, published ports, privileges, filesystems, mounts, and resource limits.

Trusted release owns deep restart, reinstall, recovery, cleanup compatibility,
containment-violation probes, export concurrency, and the optional HSA overlay.
PR assembly does not rebuild candidates. Diagnostics, teardown, and evidence
collection run after failures. See
[production smoke debugging](production-smoke-debug.md) to reproduce assembly
failures and [trusted container publishing](trusted-container-publishing.md)
for release validation.

## Local runs and ownership changes

`npm run test:integration`
selects browser-functional chunks; `npm run test:integration:prodlike` selects
the fixed runtime contract. Targeted development tests use the same command
with Playwright arguments.

Use `node tests/integration-chunks.mjs list --suite dev` to find chunk IDs,
then `npm run test:integration -- --chunk dev-navigation` to run one chunk.
Passing a spec path or other Playwright arguments runs Playwright directly,
without chunk restarts or report merging. See the
[SQL Server workflow](sql-server-developer-workflow.md) and
[authentication workflow](auth-developer-workflow.md) for local service setup.

When adding, moving, renaming, or removing a specification, update the ownership
rules in `tests/integration-chunks.mjs` if needed, then run
`npm run test:integration:chunks:generate` and
`npm run test:integration:chunks:check`. Commit the generated
[chunk manifest](../../tests/integration-chunks.manifest.json) with the change.
