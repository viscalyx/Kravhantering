# Security CI

Continuous-integration security checks specific to this repository. The
canonical scanner choice and rationale, plus instructions for tuning,
extending, and replicating the scan locally.

## SSDLC (Secure Software Development Life Cycle) gate workflow

Workflow file:
[.github/workflows/ssdlc-gate.yml](../.github/workflows/ssdlc-gate.yml).

Each pull request to `main` runs the repository-owned SSDLC gate before merge,
including forked pull requests when repository settings allow fork workflows.
The gate uses `pull_request_target`, explicitly limits `GITHUB_TOKEN` to read
permissions, and checks out the base commit instead of the pull request commit.
That keeps the gate script and workflow logic trusted while still reading the
pull request body and changed file list from the GitHub API.

The implementation lives in
[scripts/security/ssdlc-gate.mjs](../scripts/security/ssdlc-gate.mjs) and can
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
[.github/workflows/security-repository.yml](../.github/workflows/security-repository.yml).

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
   version pinned in [.nvmrc](../.nvmrc).
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
against the same localhost prodlike app. Issue `#119` remains later DAST
expansion because it introduces API scanning, role matrices, full active scans,
OpenAPI generation, workflow refactoring, throwaway realms, and runtime scan
guards.

## Pull-request DAST workflow

Workflow file:
[.github/workflows/security-dast.yml](../.github/workflows/security-dast.yml).

Each pull request to `main` runs the existing authenticated **OWASP ZAP
baseline** passive scan and a **Nuclei** template scan against a fresh,
ephemeral copy of the application running on the GitHub Actions runner. Both
scanners target only `http://localhost:3001`; the workflow fails before Nuclei
runs if the configured target is not local.

### What the workflow does

1. Checks out the PR and installs dependencies with `npm ci`, using the
   Node version pinned in [.nvmrc](../.nvmrc).
2. Brings up the same disposable stack the integration tests use:
   - SQL Server via `npm run db:up && npm run db:setup`.
   - A local Keycloak realm via `npm run idp:up`.
3. Builds the production bundle with `npm run build:local-prod` and
   starts it with `next start --hostname 127.0.0.1 --port 3001` loaded
   from [.env.prodlike](../.env.prodlike).
4. Polls the new [`GET /api/health`](../app/api/health/route.ts)
   endpoint until the app is ready. The DAST gate treats the endpoint as
   healthy only when it returns HTTP `200` with JSON `{ "status": "ok" }`;
   any other status or payload keeps the retry loop running and is printed on
   terminal failure.
5. Runs [scripts/security/get-session-cookie.mjs](../scripts/security/get-session-cookie.mjs)
   to drive a real OIDC login as the realm test user `ada.admin` and
   obtain the iron-session cookie. The flow mirrors
   [tests/integration/global-setup.ts](../tests/integration/global-setup.ts).
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
   [.github/nuclei/templates/unauth](../.github/nuclei/templates/unauth).
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
[.github/workflows/security-dast.yml](../.github/workflows/security-dast.yml).
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
[.github/zap/rules.prodlike.tsv](../.github/zap/rules.prodlike.tsv):

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

Edit [.github/zap/rules.prodlike.tsv](../.github/zap/rules.prodlike.tsv)
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
2. Mentions in `docs/security-ci.md` why the suppression is safe.

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

## REST API Schema And Schemathesis Workflow

<!-- cSpell:ignore Schemathesis -->

Workflow file:
[.github/workflows/security-api.yml](../.github/workflows/security-api.yml).

The repo-owned OpenAPI contract and Schemathesis scan cover the authenticated
requirements REST API. The scan runs only against `http://localhost:3001` after
starting the same disposable SQL Server, Keycloak, and prodlike Next.js stack
used by the PR DAST workflow.

The static contract lives in
[openapi/requirements-api.yaml](../openapi/requirements-api.yaml). It is not
served by the app and does not add a runtime `/openapi` route.

### API scan scope

Covered by this scan:

- `/api/auth/me`
- Requirement list, detail, create, edit, archive, version read,
  delete-draft, restore, reactivate, and transition routes.
- Read-only requirements library routes used by the requirements UI.

The delete-draft success contract returns the same deletion-ledger payload for
both outcomes: `deleted` is an ordered array with the
`draftRequirementVersion` entry first. When the parent requirement row is also
deleted, the array includes a second `requirement` entry for the same
`requirementUniqueId`.

Deferred from this scan:

- CSV export, MCP, AI routes, admin catalog mutations, specifications,
  deviations, and improvement suggestions.
- ZAP API scan, role-matrix DAST, full active scans, and paid vendor scanners
  that require service-specific CI secrets.

Those deferred items are later issue `#119` work. The API contract and bounded
property-test foundation do not close `#119`.

### API workflow steps

1. Installs Node dependencies with `npm ci`.
2. Installs pinned `schemathesis==4.15.2` with Python.
3. Starts SQL Server and runs `npm run db:setup`.
4. Starts the local Keycloak realm.
5. Builds and starts the prodlike app on `127.0.0.1:3001`.
6. Polls `/api/health`.
7. Acquires the local admin session cookie for `ada.admin`.
8. Fails before scanning unless the target is exactly
   `http://localhost:3001`.
9. Runs Schemathesis with deterministic bounded settings, a local-only request
   rate that fits inside the CI timeout budget, and browser REST auth/CSRF
   headers.
10. Prints the Schemathesis runtime in an `always()` step so scan-speed
    regressions are visible even when the scanner fails.
11. Uploads JUnit, NDJSON, stdout/stderr, timing files, and app logs with
    `if: always()`.

The mutating scan requests include the masked local session cookie,
`Origin: http://localhost:3001`, and
`X-Requested-With: XMLHttpRequest`. Schemathesis output sanitization stays
enabled. HAR export is intentionally not used by this workflow.

The root `schemathesis.toml` disables coverage probes for unexpected HTTP
methods. Next.js constructs a web `Request` before application middleware runs,
and forbidden Fetch methods such as `TRACE` fail inside the framework before the
app can return a controlled `405`.

### API failure policy

Schemathesis fails the workflow on server errors, undocumented status codes,
content-type mismatches, response-schema mismatches, scanner execution errors,
or schema configuration errors. Artifacts are uploaded before the final failure
is emitted.

See [docs/api-security.md](api-security.md) for local run instructions and path
addition rules.

## MCP Seeded HTTP Workflow

Workflow file:
[.github/workflows/security-mcp.yml](../.github/workflows/security-mcp.yml).

The MCP seeded-HTTP security gate starts the prodlike localhost stack, obtains
a local Keycloak service-account token, and uses the MCP Streamable HTTP client
against `http://localhost:3001/api/mcp`.

This is not a paid vendor DAST scan. HAR generation, role-matrix DAST, ZAP API
scan, active scans, production targets, and production secrets remain out of
scope for this workflow. The Nuclei template remains the unauthenticated
`/api/mcp` exposure check, while the MCP unit/property tests remain the main
protocol contract.

The workflow deliberately does not call live OpenRouter endpoints. OpenRouter
is an external service, so CI validates this repository's request construction,
response handling, and disabled-provider safety path instead of depending on a
paid provider's availability, account state, rate limits, or production-like
secrets.

### MCP workflow steps

1. Installs Node dependencies with `npm ci`.
2. Starts SQL Server and runs `npm run db:setup`.
3. Starts the local Keycloak realm and waits for both OIDC discovery and JWKS
   to answer on `http://127.0.0.1:8080`.
4. Builds and starts the prodlike app on `127.0.0.1:3001` with OpenRouter
   env vars blank.
5. Polls `/api/health`.
6. Fails before scanning unless the target is exactly
   `http://localhost:3001`.
7. Runs [scripts/security/get-mcp-token.mjs](../scripts/security/get-mcp-token.mjs)
   to acquire the local `kravhantering-mcp` client-credentials token.
8. Masks the token and runs
   [tests/integration/mcp-seeded-scan.spec.ts](../tests/integration/mcp-seeded-scan.spec.ts).
9. Prints `test-results/mcp-seeded/summary.md` to the job log and GitHub step
   summary when the scan writes one.
10. Uploads MCP JSONL/summary artifacts and the application log before the
    final failure step.

The seeded corpus lives under
[tests/fixtures/mcp-requests](../tests/fixtures/mcp-requests). Cases resolve
IDs from the disposable seeded database at runtime so the fixture does not
hard-code requirement, version, or specification IDs.

The workflow keeps the scan target as `http://localhost:3001`, but uses
`http://127.0.0.1:8080/realms/kravhantering-dev` for Keycloak token and JWKS
traffic. That keeps the CI-only service-to-service issuer stable for Node's
server-side JWKS fetch while preserving the localhost-only application target
guard.

### MCP failure policy

The workflow fails on localhost guard failure, token acquisition failure,
missing or extra MCP tools, unauthenticated 2xx responses, valid-token
transport failures, unexpected 5xx responses, unexpected MCP errors for
positive cases, unsafe mutation behavior, sensitive output, or AI-assisted
authoring success while OpenRouter env vars are unset. The last check proves
the scan is exercising the local disabled-provider path, not live provider
availability.

Allowed expected negatives are limited to missing or invalid Bearer tokens,
unknown tool, stale edit conflict, and sanitized AI-disabled error.

See [docs/mcp-seeded-dast.md](mcp-seeded-dast.md) for local run instructions
and corpus extension rules.

## Shared prodlike app cleanup

<!-- cSpell:ignore setsid pgid -->
The DAST, REST API Schemathesis, and MCP seeded workflows use
[scripts/security/prodlike-app.sh](../scripts/security/prodlike-app.sh) to
start the prodlike Next.js server under `setsid` so the wrapper, `npx` shims,
and `next start` Node process share a dedicated process group. Each
`Stop prodlike app` step reads the workflow-local `app.pgid`, sends `TERM` to
the process group, waits up to 10 seconds, then sends `KILL` if any process
remains.

The marker is a process-group ID, not a single child PID. Do not switch these
workflows back to `app.pid` unless the startup and cleanup model changes.

## Static security headers

Static (per-response, non-nonce) security headers are set in the
`headers()` block of [next.config.ts](../next.config.ts) and apply to
every route. CSP is intentionally **not** set there — it carries a
per-request nonce and is set in [middleware.ts](../middleware.ts) instead.
The supported browser baseline is modern Chrome, Edge, Firefox, Safari, and
current platform WebViews. IE and pre-CSP2 browser engines are unsupported, so
CSP `frame-ancestors` is the clickjacking control.

> **Filename note.** This app keeps the entry gate in `middleware.ts`.
> Next 16.2.4 accepts the `proxy.ts` convention, but emits the chunk
> without registering it in `.next/server/middleware-manifest.json`,
> so the matcher does not run at runtime. `middleware.ts` is the
> supported filename for this app until `proxy.ts` registration works in
> the tested Next.js version; the file content is otherwise identical.

Current static headers and rationale:

- `X-Content-Type-Options: nosniff` — disable MIME sniffing.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  — applied in production; the prodlike CI runner serves over plain
  HTTP and ZAP rule `10035` is suppressed accordingly.
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
  These probe destructively and require an isolated, throwaway
  environment.
- **Deeper ZAP scanning from issue `#119`.** API scans, role matrices, full
  active scans, OpenAPI generation, composite action refactors, and throwaway
  realms are later DAST work.
- **Authenticated coverage of every role.** Only the `Admin` realm
  user is scanned; other roles (`Reviewer`, requirement area owner, specification
  owner, etc.) are exercised by the Playwright integration tests but
  not separately scanned. Adding them would multiply CI time.
- **Infrastructure / host scanning.** Out of scope. If host or
  container vulnerability scanning is required, use a dedicated tool
  (e.g. Trivy, Grype) in a separate workflow rather than ZAP.
- **External services.** No production endpoints, no third-party
  hosts, no externally controlled URLs are ever scanned. The target is
  always `http://localhost:3001`. Live OpenRouter calls are intentionally
  outside security CI; mocked tests cover this repository's client contract.

## Adding active or scheduled scanning later

The recommended path when active scanning becomes worthwhile:

1. Create a separate workflow triggered on `schedule` (e.g. nightly)
   plus `workflow_dispatch`.
2. Reuse the same bring-up steps (DB + IdP + prodlike server) so the
   target is identical to PR scans.
3. Swap `zaproxy/action-baseline` for `zaproxy/action-full-scan`.
4. Add a sibling `rules.<scenario>.tsv` (e.g. `rules.nightly.tsv`)
   that starts from `rules.prodlike.tsv` and tightens or relaxes
   rules as the active scan requires.
5. Optionally seed the spider with the OpenAPI spec for the public
   API once one exists.

## Assumptions made

- The CI runner is single-tenant and disposable, so localhost-only
  transport headers do not need to be hardened.
- The Keycloak realm shipped under
  [dev/keycloak/realm-kravhantering-dev.json](../dev/keycloak/realm-kravhantering-dev.json)
  is the only IdP target for PR scans; production credentials are
  never required.
- The `kravhantering_session` cookie name (`AUTH_SESSION_COOKIE_NAME`
  default in [lib/auth/config.ts](../lib/auth/config.ts)) is unchanged.
  If that default ever changes, update the workflow's `env:` block
  accordingly.
- `zaproxy/action-baseline@v0.15.0` is pinned. Bumps should land in
  their own PR and re-run the scan to compare report deltas.
