# Security CI

Continuous-integration security checks specific to this repository. The
canonical scanner choice and rationale, plus instructions for tuning,
extending, and replicating the scan locally.

## SSDLC (Secure Software Development Life Cycle) gate workflow

Workflow file:
[.github/workflows/ssdlc-gate.yml](../../.github/workflows/ssdlc-gate.yml).

Each pull request to `main` runs the repository-owned SSDLC gate before merge,
including forked pull requests when repository settings allow fork workflows.
The gate uses `pull_request_target`, explicitly limits `GITHUB_TOKEN` to read
permissions, and checks out the base commit instead of the pull request commit.
That keeps the gate script and workflow logic trusted while still reading the
pull request body and changed file list from the GitHub API.

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

### AI and MCP AISVS Evidence

AI- and MCP-sensitive changes should reference the current
[AISVS AI and MCP Control Mapping](./aisvs-ai-mcp-control-mapping.md) when they
affect prompt construction, model invocation, output handling, MCP transport,
MCP tools, or safety/security audit logging.

The mapping is an assurance overlay. It does not replace the SSDLC checkbox,
route tests, MCP tests, DAST, dependency checks, or human review. It records
which AISVS controls are implemented, partially implemented, deferred, or not
applicable for the current product surface.

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

Each pull request to `main`, push to `main`, weekly scheduled run, and manual
dispatch runs the repository-owned supply-chain gate. The workflow uses the
normal `pull_request` event, never `pull_request_target`, and does not receive
production secrets or custom secret values.

### GitHub-owned controls

CodeQL and GitHub Secret Protection are repository or organization controls,
not repo-owned workflow steps in this phase.

- CodeQL default setup is already enabled in GitHub for pull requests and
  `main`.
- GitHub secret scanning and push protection are already enabled in GitHub.
- Gitleaks is intentionally skipped for now to avoid duplicate
  secret-scanning noise. Reconsider it only if future evidence shows GitHub
  custom patterns cannot cover repo-specific secret formats.

Trivy secret scanning is also disabled in this workflow. GitHub Secret
Protection owns the secret-detection surface.

### Repository workflow steps

1. Checks out the PR and installs dependencies with `npm ci`, using the Node
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

The workflow pins the Trivy action to the immutable peeled commit for
`aquasecurity/trivy-action` `v0.36.0`:

```text
aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25
```

It also pins the Trivy binary with `version: v0.70.0`. Do not replace either
pin with `latest`. Bumps should land in their own PR, use patched releases, and
cite the upstream release or advisory that motivated the change.

There is no `.trivyignore` file initially. If an ignore becomes unavoidable,
add the smallest possible exception with an issue link and an expiry rationale.

### Repository failure policy

- `npm audit` fails the workflow only for high or critical audit findings.
- Trivy filesystem scanning fails on `HIGH` or `CRITICAL` vulnerability
  findings.
- Trivy config scanning fails on `HIGH` or `CRITICAL` configuration findings.
- SARIF upload is skipped for fork PRs so read-only fork permissions do not
  break the job.
- GitHub-managed CodeQL and secret scanning keep their existing repository
  policies outside this workflow.

### Related DAST issues

Issue `#106` (Nuclei alongside OWASP ZAP) and issue `#119` (deeper ZAP
scanning) are DAST expansion work. They are intentionally not part of the
repository and supply-chain gate.

The pull-request DAST workflow implements `#106` by adding Nuclei beside ZAP
against the same localhost prodlike app. Issue `#119` adds deeper ZAP coverage
through API, role-matrix, and isolated full active scan workflows. The existing
OpenAPI/Schemathesis contract remains authoritative; the ZAP API scan consumes
a filtered read-only contract derived from that static source.

## Pull-request DAST workflow

Workflow file:
[.github/workflows/security-dast.yml](../../.github/workflows/security-dast.yml).

Each pull request to `main` runs the existing authenticated **OWASP ZAP
baseline** passive scan and a **Nuclei** template scan against a fresh,
ephemeral copy of the application running on the GitHub Actions runner. Both
scanners target only `http://localhost:3001`; the workflow fails before Nuclei
runs if the configured target is not local.

### What the workflow does

1. Checks out the PR and installs dependencies with `npm ci`, using the
   Node version pinned in [.nvmrc](../../.nvmrc).
2. Brings up the same disposable stack the integration tests use:
   - SQL Server via `npm run db:up && npm run db:setup`.
   - A local Keycloak realm via `npm run idp:up`, which waits for OIDC
     discovery and JWKS before returning.
3. Builds the production bundle with `npm run build:local-prod` and
   starts it with `next start --hostname 127.0.0.1 --port 3001` loaded
   from [.env.prodlike](../../.env.prodlike).
4. Polls the new [`GET /api/health`](../../app/api/health/route.ts)
   endpoint until the app is ready. The DAST gate treats the endpoint as
   healthy only when it returns HTTP `200` with JSON `{ "status": "ok" }`;
   any other status or payload keeps the retry loop running and is printed on
   terminal failure.
5. Runs [scripts/security/get-session-cookie.mjs](../../scripts/security/get-session-cookie.mjs)
   to drive a real OIDC login as the realm test user `ada.admin` and
   obtain the iron-session cookie. The flow mirrors
   [tests/integration/global-setup.ts](../../tests/integration/global-setup.ts).
   Before printing the cookie, the helper validates the final stdout line
   against a strict CI-safe `name=value` contract. Names may contain only ASCII
   letters, digits, `_`, and `-`; values may contain only ASCII letters,
   digits, `.`, `_`, `~`, `*`, `+`, `/`, `=`, and `-`. A mismatch exits
   non-zero before printing the cookie, so scanner setup fails before ZAP,
   Nuclei, or Schemathesis can run with a malformed or truncated session
   header.
   Each helper fetch has a `15000` ms timeout by default. Set
   `DAST_FETCH_TIMEOUT_MS` to a positive integer number of milliseconds when
   a workflow needs a different bound; every redirect hop and the final
   `/api/auth/me` verification receives its own fresh timeout signal.
6. Runs the [`zaproxy/action-baseline`](https://github.com/zaproxy/action-baseline)
   action against `http://localhost:3001/sv` with the captured cookie
   injected as a `Cookie` header on every request via ZAP's `replacer`
   add-on.
7. Installs Nuclei with <!-- cSpell:ignore nuclei projectdiscovery -->
   [`projectdiscovery/nuclei-action@v3`](https://github.com/projectdiscovery/nuclei-action),
   pins the Nuclei binary to `v3.8.0`, downloads the ProjectDiscovery
   community templates with `nuclei -update-templates -ni`, and runs
   repo-owned unauthenticated boundary templates from
   [.github/nuclei/templates/unauth](../../.github/nuclei/templates/unauth).
8. Runs an authenticated Nuclei pass with the same masked session cookie used
   by ZAP against the installed community templates under
   `${HOME}/nuclei-templates`. Nuclei output omits raw request/response data
   and redacts `Cookie` and `Authorization` values.
9. Uploads the ZAP HTML / Markdown / JSON reports (created by the action
   itself), the Nuclei JSONL / SARIF / Markdown / log output, and the
   application log as workflow artifacts.

### Scanner responsibility split

- **ZAP baseline:** authenticated crawl, passive web checks, response headers,
  cookie attributes, and browser-facing page coverage.
- **Nuclei:** known CVE/template checks, exposures, misconfigurations, exposed
  panels, technology checks, and accidentally exposed files.

The workflow extends
[.github/workflows/security-dast.yml](../../.github/workflows/security-dast.yml).
Do not add a second PR-time web DAST workflow unless the scan shape changes
enough to require a separate lifecycle.

### Why ZAP baseline (passive) was chosen

- **Safe for PRs.** Passive scanning never sends crafted exploit
  payloads, only observes traffic generated by the spider. Active
  scanning (`zap-full-scan`) issues SQL injection, XSS, and
  command-injection probes that can mutate state, blow up the database,
  or fire e-mails when a feature is misconfigured. That risk is not
  worth taking on every PR against a developer's branch.
- **Fast enough for per-PR runs.** A baseline + AJAX spider with a
  10-minute cap fits inside the existing integration-test budget.
- **Already containerized.** The official action provides a pinned
  Docker image (no client-side install on the runner) and emits
  consistent report artifacts.
- **Tunable per-rule.** ZAP exposes per-rule IGNORE/WARN/FAIL via a
  `rules.<scenario>.tsv` file checked into the repo, so policy decisions
  live next to the workflow and can be code-reviewed.

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

If the first scan reports an unexpected alert that turns out to be a
local-CI artefact, suppress it via `rules.prodlike.tsv` and document
why in the comment column.

Rule files are named `rules.<scenario>.tsv` so future scan scenarios
(for example a nightly full scan against a staging deployment) can
ship their own policy file alongside without disturbing the PR
baseline.

Nuclei uses a different failure policy:

- Medium findings are reported in artifacts and SARIF but do not fail the PR.
- High or critical findings fail the workflow after artifacts are uploaded.
- Empty or absent Nuclei result files mean no findings and do not fail.
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

`action` is one of `IGNORE`, `WARN`, `FAIL`. **Always include a
comment** explaining why the rule was changed; reviewers will block the
PR otherwise. ZAP rule IDs and descriptions are listed at
<https://www.zaproxy.org/docs/alerts/>.

If the very first scan reports unexpected Medium/High alerts that turn
out to be local-CI artefacts (e.g. test-only cookies missing
`Secure`), open a follow-up PR that:

1. Adds the rule ID to `rules.prodlike.tsv` with `IGNORE` and a clear
   comment.
2. Mentions in `docs/security-privacy/security-ci.md` why the suppression is safe.

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

There are no Nuclei suppressions initially. If community template noise needs
tuning, prefer the smallest tag/template exclusion that keeps the PR scan safe,
and document the reason here with an issue link.

### Reading reports

After the workflow finishes, download the **`zap_scan`** artifact from
the workflow run summary. It contains:

- `report_html.html` — human-readable findings with payload context.
- `report_md.md` — drop-in for PR comments.
- `report_json.json` — machine-parseable for downstream tooling.

The application log captured during the scan is uploaded separately as
**`dast-app-log`** and is the first thing to inspect when ZAP cannot
reach the app.

Download the **`nuclei_scan`** artifact for Nuclei triage. It contains JSONL,
SARIF, Markdown exports, stdout/stderr logs, and the local target file used by
the scan. The SARIF files are also uploaded to GitHub code scanning for
same-repository PRs when they exist.

The workflow also prints a bounded DAST summary to the job log and GitHub step
summary: the ZAP outcome, template-update, unauthenticated-scan, and
authenticated-scan outcomes, the last 200 lines of each Nuclei stdout/stderr
log, and parsed medium/high/critical finding counts. When findings exist, the
first entries are listed in the log and step summary; the full JSONL and
Markdown output remains in the artifact.

## Deeper ZAP Workflows

Issue `#119` adds three ZAP workflows without replacing the PR web DAST gate.
All targets remain localhost-only and all ZAP actions disable built-in issue
writing. Scheduled findings fail the workflow and are triaged from artifacts;
automatic issue creation is intentionally deferred until baselines are stable.

<!-- markdownlint-disable MD013 -->
| Workflow | Trigger | Auth users | Active? | Time budget | Main artifacts |
| --- | --- | --- | --- | --- | --- |
| [`security-dast-api.yml`](../../.github/workflows/security-dast-api.yml) | PR path filter + manual | `ada.admin` | ZAP API active mode against read-only OpenAPI operations | 30 min job / 10 min ZAP | `zap-api-scan`, `zap-api-openapi`, app log |
| [`security-dast-roles.yml`](../../.github/workflows/security-dast-roles.yml) | Nightly 03:00 UTC + manual role input | Canonical local role users | No; ZAP baseline only | 30 min per role | one ZAP artifact and app log per user |
| [`security-dast-full.yml`](../../.github/workflows/security-dast-full.yml) | Manual only while rules are triaged | `full.scan` plus unauthenticated pass | Yes; ZAP full active scan | 120 min job | authenticated/unauthenticated ZAP reports, app log, SQL Server backup |
<!-- markdownlint-enable MD013 -->

The shared local actions under
[.github/actions](../../.github/actions) own prodlike stack setup, browser
session-cookie acquisition, and cleanup. Keep external `uses:` references
pinned in workflow files; local action references stay unpinned by design.

The full-scan workflow generates a temporary Keycloak import under
`test-results/security-dast-full/keycloak`, starts the app against
`kravhantering-full-scan`, and sets `AI_REQUIREMENT_GENERATION_DISABLED=1` so
REST and MCP AI-assisted authoring return the normal sanitized provider
unavailable response before any OpenRouter catalog or chat call.

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

<!-- cSpell:ignore setsid pgid -->
The DAST, REST API Schemathesis, MCP seeded, ZAP API, role-matrix, and full
active scan workflows use
[scripts/security/prodlike-app.sh](../../scripts/security/prodlike-app.sh) to
start the prodlike Next.js server under `setsid` so the wrapper, `npx` shims,
and `next start` Node process share a dedicated process group. Each
shared cleanup action reads the workflow-local `app.pgid`, sends `TERM` to the
process group, waits up to 10 seconds, then sends `KILL` if any process
remains. The same cleanup action also tears down the local IdP and SQL Server
services with workflow-specific overrides where the full scan uses a temporary
realm import.

The marker is a process-group ID, not a single child PID. Do not switch these
workflows back to `app.pid` unless the startup and cleanup model changes.

## Static security headers

Static (per-response, non-nonce) security headers are set in the
`headers()` block of [next.config.ts](../../next.config.ts) and apply to
every route. CSP is intentionally **not** set there — it carries a
per-request nonce and is set in [proxy.ts](../../proxy.ts) instead.
The supported browser baseline is modern Chrome, Edge, Firefox, Safari, and
current platform WebViews. IE and pre-CSP2 browser engines are unsupported, so
CSP `frame-ancestors` is the primary clickjacking control for page responses.
`X-Frame-Options` remains as a static fallback because the proxy matcher
intentionally skips dotted paths such as asset probes, while static headers
still apply to those responses.

> **Filename note.** This app keeps the entry gate in `proxy.ts`.
> On `next@16.2.9`, the proxy runs as Node.js middleware and records the
> matcher under `/_middleware` in
> `.next/server/functions-config-manifest.json`. For this convention,
> `.next/server/middleware-manifest.json` can be empty; do not use that
> file alone as the registration check.

Current static headers and rationale:

- `X-Frame-Options: DENY` — static clickjacking fallback for responses that
  do not pass through the proxy and therefore do not receive the nonce-based
  CSP header.
- `X-Content-Type-Options: nosniff` — disable MIME sniffing.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  — applied in production; the prodlike CI runner serves over plain
  HTTP and ZAP rules `10035` and `10106` are suppressed accordingly.
- `Referrer-Policy: strict-origin-when-cross-origin` — minimal
  referrer leakage on outbound navigation.
- `Cross-Origin-Opener-Policy: same-origin` — isolates the top-level
  browsing context (resolves ZAP `90004`, issue #112). The app does
  not open cross-origin popups; OIDC sign-in is a top-level redirect.
- `Cross-Origin-Resource-Policy: same-origin` — blocks no-cors
  cross-origin embedding of our resources. The app does not expose
  embeddable assets to other origins.
- `Cross-Origin-Embedder-Policy: credentialless` — required to silence
  ZAP rule `90004`, which checks for the COEP header by name. The
  `credentialless` value satisfies the rule without forcing every
  embedded resource to advertise CORP (as `require-corp` would). All
  current sources are same-origin, so the credential-stripping behaviour
  for any future cross-origin no-cors load has no effect on the app
  today, and we still avoid opting into full cross-origin isolation
  (no `SharedArrayBuffer`, no high-resolution timers needed).
- `Permissions-Policy: …=()` — denies every powerful browser feature
  the app does not use.

## Out of scope (for the PR workflow)

- **Active scanning** (`zap-full-scan`, fuzzers, payload mutation).
  These remain out of the PR web workflow. The full active scan has a separate
  manual workflow with isolated database and Keycloak state.
- **Authenticated coverage of every role in PRs.** Only the `Admin` realm user
  is scanned by the PR web DAST workflow. Broader role coverage runs in the
  scheduled role-matrix workflow.
- **Infrastructure / host scanning.** Out of scope. If host or
  container vulnerability scanning is required, use a dedicated tool
  (e.g. Trivy, Grype) in a separate workflow rather than ZAP.
- **External services.** No production endpoints, no third-party
  hosts, no externally controlled URLs are ever scanned. The target is
  always `http://localhost:3001`. Live OpenRouter calls are intentionally
  outside security CI; mocked tests cover this repository's client contract.

## Enabling full-scan scheduling later

Keep [`security-dast-full.yml`](../../.github/workflows/security-dast-full.yml)
manual until at least three manual runs have been triaged. Then update the
workflow with the weekly Sunday `04:00 UTC` schedule, tighten
[.github/zap/rules.full.tsv](../../.github/zap/rules.full.tsv) where alerts are
actionable, and document every suppression with an issue or rationale.

## Assumptions made

- The CI runner is single-tenant and disposable, so localhost-only
  transport headers do not need to be hardened.
- The Keycloak realm shipped under
  [dev/keycloak/realm-kravhantering-dev.json](../../dev/keycloak/realm-kravhantering-dev.json)
  is the only IdP target for PR scans; production credentials are
  never required.
- The `kravhantering_session` cookie name (`AUTH_SESSION_COOKIE_NAME`
  default in [lib/auth/config.ts](../../lib/auth/config.ts)) is unchanged.
  If that default ever changes, update the workflow's `env:` block
  accordingly.
- ZAP actions are pinned to peeled release commits:
  `action-baseline` `v0.15.0`,
  `action-api-scan` `v0.10.0`, and
  `action-full-scan` `v0.13.0`. Bumps should land in their own PR and re-run
  the affected scans to compare report deltas.
