# Security CI

This guide helps contributors and security maintainers diagnose CI security
failures, review scan evidence, and tune scanner policy.

The integration and container PR responsibilities are defined in
[CI integration ownership](../development/ci-integration-ownership.md).
[Shared CI selection](../development/ci-selection.md) determines which
security owners run for a change. A successful reporting check can represent
an intentional exclusion; inspect its selection summary before assuming a
scanner ran. Trusted-release policy evaluation and operational qualification
remain required before publishing.

## SSDLC (Secure Software Development Life Cycle) gate workflow

Workflow file:
[.github/workflows/ssdlc-gate.yml](../../.github/workflows/ssdlc-gate.yml).

Each pull request to `main` runs the repository-owned SSDLC gate before merge,
including forked pull requests when repository settings allow fork workflows.
The gate skips pull requests authored by `dependabot[bot]`. It uses
`pull_request_target`, explicitly limits `GITHUB_TOKEN` to read permissions,
and checks out the base commit instead of
the pull request commit. That keeps the gate script and workflow logic trusted
while still reading the pull request body and changed file list from the GitHub
API.

The implementation lives in
[scripts/security/ssdlc-gate.mjs](../../scripts/security/ssdlc-gate.mjs) and can
be exercised locally with:

```bash
npm run ssdlc:gate -- --changed-files <path> --pr-body <path>
```

### Triggered surfaces

The gate requires evidence when a pull request touches app code, API contract
or routes, authentication, authorization, session handling, audit/logging,
personal-data handling, database schema or migrations, AI/MCP integrations,
dependencies, containers, security workflows, release scripts, or the
security policy and review templates themselves.

### Required pull request evidence

The pull request template contains a stable hidden marker that the script uses
for validation. For security-sensitive changes, the SSDLC checkbox must be
checked to confirm the author reviewed SSDLC requirements and addressed any
security, data protection, threat-model, and security-testing impacts for the
change.

The check validates that the pull request author made this explicit
assertion, not whether the assessment is correct. Human reviewers still own
the security judgement.

Do not change the SSDLC gate to check out or execute pull request code under
`pull_request_target`. If the gate ever needs to inspect file contents, add a
separate `pull_request` workflow with read-only permissions and no secrets, or
fetch the specific data through the GitHub API without executing it.

## Repository and supply-chain workflow

Workflow file:
[.github/workflows/security-repository.yml](../../.github/workflows/security-repository.yml).

The repository-owned supply-chain workflow receives pull requests to `main`,
pushes to `main`, weekly scheduled runs, and manual dispatches. Shared CI
selection determines whether its scan job runs. The workflow uses the
normal `pull_request` event, never `pull_request_target`, and does not receive
production secrets or custom secret values.

### GitHub-owned controls

CodeQL and GitHub Secret Protection are configured in GitHub repository or
organization settings. Their status cannot be inferred from this workflow;
repository administrators should verify those settings when auditing coverage.
The repository workflow runs neither Gitleaks nor Trivy secret scanning.

### Repository workflow steps

1. Checks out the event source, installs the exact npm version declared by root
   `package.json`, and installs dependencies with `npm ci`, using the Node
   version pinned in [.nvmrc](../../.nvmrc).
2. Runs `npm audit --audit-level=high`.
3. Runs Trivy filesystem vulnerability scanning for `HIGH` and `CRITICAL`
   findings across OS and library packages.
4. Runs Trivy config/IaC scanning for `HIGH` and `CRITICAL` findings.
5. Uploads Trivy SARIF to GitHub code scanning for same-repository PRs and
   other events where `security-events: write` is available.
6. Uploads the Trivy SARIF files as the **`trivy-repository-security`**
   artifact even when a scan fails.

### Trivy pinning and safety

Keep the Trivy action pinned to a full commit SHA and the binary pinned to an
explicit version in the workflow. Do not replace either pin with `latest`.
Review scanner updates separately and cite the upstream release or advisory
that motivates the change.

The config scan reads [.trivyignore.yaml](../../.trivyignore.yaml). Its scoped
root-user exceptions cover the disposable systemd debug host and the one-shot
HSA certificate provisioner. If another exception becomes unavoidable, limit
it to the affected rule and paths and explain the operational requirement,
issue reference, and review or expiry condition.

### Repository failure policy

- `npm audit` blocks on high or critical audit findings. Audit execution
  failures also fail the job.
- Trivy filesystem scanning fails on `HIGH` or `CRITICAL` vulnerability
  findings.
- Trivy config scanning fails on `HIGH` or `CRITICAL` configuration findings.
- SARIF upload is skipped for fork PRs so read-only fork permissions do not
  break the job.
- GitHub-managed CodeQL and secret scanning keep their existing repository
  policies outside this workflow.

## Container vulnerability workflows

Pull-request and trusted-release container builds use
`.github/actions/container-vulnerability-gate`. The shared action generates an
SPDX SBOM from each exact candidate image or OCI archive, scans it with a
current Grype database, and evaluates
`.github/container-vulnerability-exceptions.json` through the same policy
implementation. Fixable unexcepted High or Critical findings and malformed,
expired, stale or no-longer-matching exceptions fail the gate. Complete scan
reports remain unfiltered in workflow artifacts.

The scheduled and manually dispatched
`.github/workflows/container-vulnerability-monitor.yml` rescans the supported
published stable release and monitored preview release selected by
`.github/container-release-support.json`. It verifies release-asset digests and
the trusted release workflow's digest-bound SPDX attestations before scanning;
it never rebuilds the published images.

Public tracking uses one automation-owned security issue per image role and
release tag. Findings that cannot be safely classified for public disclosure
remain private; do not copy unfiltered scan evidence into public issues.
An identity marked `monitoring-ended` is no longer scanned. Its last recorded
state is not evidence of a fix or of current safety.

Restricted scan and reconciliation evidence is retained for 30 days. Inspect
the failed run and its artifacts before retrying; daily runs and manual
dispatch perform the same full reconciliation. See
[Trusted Container Publishing](../development/trusted-container-publishing.md#continuous-published-release-scanning)
for support windows, exception handling, permissions, disclosure rules, and
monitor recovery guidance.

## Pull-request DAST workflow

Workflow file:
[.github/workflows/security-dast.yml](../../.github/workflows/security-dast.yml).

When shared CI selection selects web DAST for a pull request to `main`, the
workflow runs an authenticated **OWASP ZAP baseline** passive scan and a
**Nuclei** template scan against a fresh, ephemeral copy of the application
running on the GitHub Actions runner. Both
scanners target only `http://localhost:3001`; the workflow fails before Nuclei
runs if the configured target is not local.

### What the workflow does

1. Installs the pinned Node/npm toolchain and dependencies, then starts a
   disposable SQL Server, Keycloak, and production Next.js stack through
   [.github/actions/prodlike-stack](../../.github/actions/prodlike-stack/action.yml).
   Readiness requires `/api/health` to return HTTP `200` and JSON with
   `status: "ok"`.
2. Uses [get-session-cookie.mjs](../../scripts/security/get-session-cookie.mjs)
   to log in as `ada.admin`. Cookie validation failure stops scanner setup.
   Each helper fetch defaults to a 15-second timeout; use a positive
   `DAST_FETCH_TIMEOUT_MS` override if a workflow needs a different bound.
3. Runs ZAP against `http://localhost:3001/sv` with that session cookie, the
   AJAX spider, and a 10-minute scan cap. Preserve `-j --ajax-spider` so the
   scanner image's default crawler cannot change the selected spider.
4. Installs the pinned Nuclei binary and community templates, runs
   [unauthenticated boundary templates](../../.github/nuclei/templates/unauth),
   then scans with community templates using the same authenticated cookie.
5. Uploads ZAP and Nuclei reports and the application log, evaluates the
   outcomes, and cleans up the stack even after failure.

### Scanner responsibility split

- **ZAP baseline:** authenticated crawl, passive web checks, response headers,
  cookie attributes, and browser-facing page coverage.
- **Nuclei:** known CVE/template checks, exposures, misconfigurations, exposed
  panels, technology checks, and accidentally exposed files.

### Why ZAP baseline (passive) was chosen

The PR web scan observes crawl traffic without active exploit payloads. Its
10-minute cap and per-rule policy suit routine PR checks. Full active scanning
uses a separate manual workflow because it can mutate application state.

### Failure policy

`zap-baseline.py` does not have a built-in "fail on risk ≥ Medium"
switch — alert handling is **per rule**, not per risk rating. The
workflow therefore relies on per-rule actions in
[.github/zap/rules.prodlike.tsv](../../.github/zap/rules.prodlike.tsv):

- Default action for any rule that fires is `WARN`, which makes the
  baseline action exit non-zero and fail the PR.
- Rules that are pure noise on a localhost CI build are listed as
  `IGNORE` in `rules.prodlike.tsv` so they do not fail the PR.
- Rules can be explicitly escalated to `FAIL` (same effect as `WARN`
  for the build, but communicates intent).
- We deliberately do **not** pass `-I` to `zap-baseline.py`. Doing so
  would only fail on rules marked `FAIL`, which would require
  enumerating every ZAP rule we care about.

Keep each scan scenario's policy in its own `rules.<scenario>.tsv` file so
tuning another workflow does not weaken the PR baseline.

Nuclei uses a different failure policy:

- Medium findings are reported in artifacts and SARIF but do not fail the PR.
- High or critical findings fail the workflow after artifacts are uploaded.
- Empty or absent Nuclei result files do not themselves fail the job;
  inspect execution outcomes before treating missing output as a clean scan.
- Scanner execution errors fail the workflow.
- SARIF upload runs only for same-repository pull requests and only when the
  SARIF file exists, so fork PRs do not fail because of read-only permissions.
- The workflow does not write failure comments to pull requests; fork PR tokens
  are read-only, so artifacts and job logs are the review surface.

The final workflow failure combines the ZAP outcome and Nuclei high/critical
findings after report artifacts are available.

### Tuning the rules

Edit [.github/zap/rules.prodlike.tsv](../../.github/zap/rules.prodlike.tsv)
using the documented format:

```text
<ruleId>\t<action>\t<comment>
```

`action` is one of `IGNORE`, `WARN`, `FAIL`, `INFO`, or `PASS`. **Always
include a comment** explaining why the rule was changed. ZAP rule IDs and
descriptions are listed at
<https://www.zaproxy.org/docs/alerts/>.

Suppress an alert only after confirming it is a local-CI artefact. Record the
reason and any issue reference in the rule file, and re-evaluate suppressions
whenever the target changes. Current policy suppresses localhost transport and
header checks and noisy bundle/comment findings. Intentional `no-store`
responses and modern-app detection are informational. A passing baseline does
not establish that the suppressed production controls work; those need their
integration and deployment verification coverage.

### Tuning Nuclei

Nuclei runs with safe PR flags: `-severity medium,high,critical`, `-jsonl`,
`-sarif-export`, `-markdown-export`, `-rate-limit 50`, `-retries 1`,
`-timeout 5`, `-duc`, `-ni`, `-omit-raw`, and redaction for `Cookie` and
`Authorization`.

The community-template update is a separate setup step
(`nuclei -update-templates -ni`); scan commands keep `-duc` so scan execution
does not also update template state.
<!-- cSpell:ignore interactsh -->
The authenticated community-template pass excludes intrusive categories and
tags, including fuzzing, brute force, denial of service, default-login
attempts, OAST/interactsh, file upload, destructive checks, and headless
browser templates.

If community template noise needs tuning, use the smallest tag/template
exclusion that keeps the PR scan safe and document its rationale and issue
reference alongside the workflow configuration.

### Reading reports

Start with **Evaluate DAST scan outcomes** and the job summary. Blocking ZAP
alerts include rule IDs, configured actions, affected URLs, and remediation.
`WARN` and `FAIL` block even for low-risk alerts. If ZAP fails without blocking
alerts or its report cannot be read, inspect the scanner step for execution
errors. Summaries are bounded; use artifacts for the full findings.

After the workflow finishes, download the **`zap_scan`** artifact from
the workflow run summary. It contains:

- `report_html.html` — human-readable findings with payload context.
- `report_md.md` — drop-in for PR comments.
- `report_json.json` — machine-parseable for downstream tooling.

The application log captured during the scan is uploaded separately as
**`dast-app-log`** and is the first thing to inspect when ZAP cannot
reach the app. This diagnostic upload is best-effort: an artifact-service
failure does not override the DAST scan outcome.

Download the **`nuclei_scan`** artifact for Nuclei triage. It contains JSONL,
SARIF, Markdown exports, stdout/stderr logs, and the local target file used by
the scan. The SARIF files are also uploaded to GitHub code scanning for
same-repository PRs when they exist.

The job log also includes Nuclei execution outcomes, log tails, and finding
counts. Check execution errors before interpreting empty result files as a
clean scan.

## Deeper ZAP Workflows

These workflows complement the PR web DAST gate. All targets remain
localhost-only and all ZAP actions disable built-in issue writing. Scheduled
findings fail the workflow and are triaged from artifacts.

<!-- markdownlint-disable MD013 -->
| Workflow | Trigger | Auth users | Active? | Time budget | Main artifacts |
| --- | --- | --- | --- | --- | --- |
| [`security-dast-api.yml`](../../.github/workflows/security-dast-api.yml) | PR shared selection + manual | `ada.admin` | ZAP API active mode against read-only OpenAPI operations | 30 min job / 10 min ZAP | `zap-api-scan`, `zap-api-openapi`, app log |
| [`security-dast-roles.yml`](../../.github/workflows/security-dast-roles.yml) | Nightly 03:00 UTC + manual role input | Canonical local role users | No; ZAP baseline only | 30 min per role | one ZAP artifact and app log per user |
| [`security-dast-full.yml`](../../.github/workflows/security-dast-full.yml) | Manual only while rules are triaged | `full.scan` plus unauthenticated pass | Yes; ZAP full active scan | 120 min job | authenticated/unauthenticated ZAP reports, app log, SQL Server backup |
<!-- markdownlint-enable MD013 -->

Use the [ZAP API guide](./security-dast-api.md) for the filtered read-only
contract and tuning, and the [full-scan runbook](./security-dast-full.md) for
isolation, execution, and scheduling requirements. The full scan uses its own
Keycloak realm and disables AI generation and OpenRouter credentials.

## REST API Schema And Schemathesis Workflow

<!-- cSpell:ignore Schemathesis -->

Workflow file:
[.github/workflows/security-api.yml](../../.github/workflows/security-api.yml).

The repo-owned OpenAPI contract and Schemathesis scan cover browser-backed JSON
REST APIs that are safe to exercise against the disposable prodlike database.
The workflow uses the same local SQL Server, Keycloak, and prodlike Next.js
shape as the PR DAST workflow, and keeps the scan target restricted to
`http://localhost:3001`.

[api-security.md](./api-security.md) is the source of truth for the REST API
scan scope, deferred paths, validation rules, workflow details, failure policy,
local run instructions, and path addition rules. Keep this page as the CI
overview so route-level scan details do not drift between files.

## MCP Seeded HTTP Workflow

Workflow file:
[.github/workflows/security-mcp.yml](../../.github/workflows/security-mcp.yml).

The MCP seeded-HTTP security gate starts the prodlike localhost stack, obtains
a local Keycloak service-account token, and uses the MCP Streamable HTTP client
against `http://localhost:3001/api/mcp`.

This is a repo-owned authenticated transport gate for `/api/mcp`, not a paid
vendor DAST scan or general crawler. The Nuclei template still owns the
unauthenticated `/api/mcp` exposure check, while the MCP unit/property tests
remain the fast protocol and authorization contract.

[mcp-seeded-dast.md](./mcp-seeded-dast.md) is the source of truth for the MCP
seeded gate scope, OpenRouter policy, local run instructions, artifacts, failure
policy, and corpus extension rules. Keep this page as the CI overview so
seeded-corpus and workflow details do not drift between files.

## Shared prodlike app cleanup

The DAST, REST API, MCP, ZAP API, role-matrix, and full-scan workflows share
[stack setup](../../.github/actions/prodlike-stack/action.yml) and
[cleanup](../../.github/actions/prodlike-cleanup/action.yml). Keep cleanup under
`if: always()` when extending a workflow. It stops the whole application
process group and tears down the workflow's SQL Server and Keycloak services.
Run these destructive setup/cleanup actions only in disposable environments;
use the dedicated scan guides for local runs with existing development services.

## Out of scope (for the PR workflow)

- **Active scanning** (`zap-full-scan`, fuzzers, payload mutation).
  These remain out of the PR web workflow. The full active scan has a separate
  manual workflow with disposable database state and a separate Keycloak realm.
- **Authenticated coverage of every role in PRs.** Only the `Admin` realm user
  is scanned by the PR web DAST workflow. Broader role coverage runs in the
  scheduled role-matrix workflow.
- **Infrastructure / host scanning.** The web DAST workflow does not scan
  hosts or container images. Container vulnerability gates run separately.
- **External services.** No production endpoints, no third-party
  hosts, no externally controlled URLs are ever scanned. The target is
  always `http://localhost:3001`. Live OpenRouter calls are intentionally
  outside security CI; mocked tests cover this repository's client contract.

## Scanner maintenance

Keep external action references pinned to full commit SHAs and binary versions
explicit in the workflows. Review updates separately and rerun affected scans
to compare report changes. Local composite-action references remain unpinned.
The disposable runner and local Keycloak realm are the security boundary for
these scans; production credentials are never needed.
