# CI integration ownership

Each required result reports independently for the same commit. A failed
candidate blocks only the assembly that needs that candidate. Browser chunks
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
protection. Acceptance belongs to the repository owner; there is no additional
proof window, runtime target, or mandatory local preflight.

The existing `HSA mTLS topology required` result now lives in Container PR
Smoke with its transport and rotation jobs. All pull requests still trigger
these checks. They consume the same mock and adapter candidate archives,
convert their format for Docker, and check loaded image identities. Only the
transport-test image and provisioner need separate security-fixture builds.
Support-policy failure does not suppress available transport evidence; the
HSA result depends on its own build, topology, and rotation outcomes.

## Integration coverage policy

`Pruned Runtime Contract` owns five fixed specifications and 17 tests:
report authorization boundaries, authentication login, authentication security,
platform smoke, and platform error-boundary smoke. The manifest validator
checks their presence before any owned service starts. One production build
with full dependencies supplies a standalone directory outside repository
dependency ancestry. The launcher creates a missing `PRODLIKE_RUNTIME_DIR`;
staging still requires that destination to be empty and outside repository
dependency ancestry. Required public and static assets accompany it. Only its
traced dependencies can resolve there; the test runner keeps the full repository
dependency tree. One Chromium worker, application process, SQL Server seed, and
real Keycloak exercise this contract. Stored sessions are limited to admin and
no-role users. Anonymous login still exercises the real OIDC redirect chain.
The real bounded PDF and CSV export path remains in this owner.

`Browser Functional Integration` uses `npm run test:integration` in development
mode. It owns browser navigation, downloads, focus, keyboard and pointer
behavior, layout, and mutations spanning UI, authorization, and persistence.
The visible role matrix remains here. Ordinary business journeys use desktop
Chromium at 1440 × 1200 once. Playwright configurations, guide generation, and
desktop scenarios share `DESKTOP_VIEWPORT` from
`tests/helpers/desktop-viewport.ts`. Explicit mobile and constrained-height
cases retain their dimensions to exercise responsive boundaries.
One 375-pixel smoke signs in, opens navigation,
and accesses the requirements library. Additional responsive checks own named
risks: navigation and Admin tab reachability, column resizing and persistence,
column-picker geometry, removal and filter targets, and AI settings geometry.
Archive, deviation, creation, package, and specification workflows run once.

Owned chunk runs obtain fresh role sessions before every chunk so long runs do
not reuse an expiring login. External-server runs refresh sessions only when
`PLAYWRIGHT_FORCE_AUTH_SETUP=1` is explicitly selected. Cold requirements routes
are prepared before timed browser navigation in the affected scenarios.

The scheduled isolated-chunk workflow uses the same browser-functional manifest
with a fresh runner and seed per chunk. It complements the shared-database PR
run. Developer Mode retains its dedicated dev-server smoke. Security MCP is the
sole owner of the seeded MCP scan, outside both integration results.

Focused tests run in `quality-checks` (the Quality Checks workflow) or
`SQL Server Invariants`. They own deterministic permutations. Browser fixture
setup signs responsibility evidence for known fixture people and the real
session actor without calling the HSA verification route or consuming its
quota. UI verification interactions retain their route boundary.

<!-- markdownlint-disable MD013 -->
| Scenario or risk | Owning focused suite |
| --- | --- |
| REQ-16C structural import-budget permutations | `tests/unit/requirement-import-budget.test.ts`, `tests/unit/requirements-import-schema-edge-cases.test.ts` |
| AUTHZ-11 child-write role matrix and parent mismatch | `tests/unit/requirements-assignment-authorization.test.ts`, `tests/unit/requirements-specification-item-route.test.ts`, `tests/unit/specification-requirement-selection-answers-route.test.ts` |
| AUTHZ-01 anonymous API and role-free API combinatorics | `tests/unit/requirements-assignment-authorization.test.ts`, `tests/unit/auth-me-route.test.ts`, pruned authentication security for the built-route boundary |
| AUTHZ-03 RFI list authorization permutations | `tests/unit/requirements-assignment-authorization.test.ts`, `tests/unit/service-rfi-questions.test.ts` |
| SPEC-10b, SPEC-10c output profile permutations | `tests/unit/specification-output-routes.test.ts`, `tests/unit/specification-report-profiles.test.ts` |
| SPEC-10e complete filtered traceability shape | `tests/unit/specification-traceability-report-route.test.ts` |
| SPEC-16b target-area authorization rejection | `tests/unit/rfi-question-suggestion-routes.test.ts`, `tests/unit/requirements-assignment-authorization.test.ts` |
| Deviation pre-approval status rejection | `tests/unit/requirements-specifications-dal.test.ts` |
| HSA response permutations, evidence and throttling | `tests/unit/responsibility-person-verification.test.ts`, `tests/unit/taxonomy-routes.test.ts`, `tests/sql-integration/hsa-verification-quota.sqlserver.test.ts` |
| Ambiguous identifiers, transaction rollback and concurrency | `tests/unit/requirements-assignment-authorization.test.ts` and the relevant `tests/sql-integration/` mutation suites |
<!-- markdownlint-enable MD013 -->

Manual cases remain in [the manual test catalog](../governance/manuella-testfall.md).
Their ownership notes distinguish browser steps from focused permutations.
Removed duplicate mobile executions have the same functional owner; the
responsive checks above own the separate viewport risks.

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

Assembly depends only on the core matrix. A separate Ubuntu 24.04 runner
imports those exact OCI archives into rootless Podman and packages their build
metadata and identities into the versioned production deployment archive.
The production installer renders user-systemd and Quadlet resources for nginx,
app-runtime, SQL Server, and Keycloak. Migrations and required seed use db-job.
A small disposable author assignment supports one browser session that reads
the library, loads bundled assets, compares embedded build metadata, and
creates and reads one requirement through nginx over HTTPS. Containment
inspection covers networks, published ports, capabilities, no-new-privileges,
read-only filesystems, writable mounts, and configured cgroup limits.

Trusted release owns deep restart, reinstall, recovery, cleanup compatibility,
containment-violation probes, export concurrency, and the optional HSA overlay.
It also builds and evaluates the HSA mTLS provisioner introduced by the strict
PKI release contract. PR assembly does not rebuild candidates or perform a
second isolated OCI import. Diagnostics, teardown, and evidence collection run
after failures. Runtime summaries are diagnostic data, not acceptance targets.

Local commands and services remain available. `npm run test:integration`
selects browser-functional chunks; `npm run test:integration:prodlike` selects
the fixed runtime contract. Targeted development tests use the same command
with Playwright arguments. No additional local execution mode is required.
