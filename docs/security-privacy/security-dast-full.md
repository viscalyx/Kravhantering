# ZAP Full Active Scan

The full active ZAP workflow is an isolated, manual DAST run for destructive
scanner behavior such as SQL injection, XSS, path traversal, and form
submission probes. It is not a PR gate and is not scheduled until manual runs
have been triaged.

This runbook is for maintainers running the scan and reviewing its findings.

## Isolation

Workflow file:
[.github/workflows/security-dast-full.yml](../../.github/workflows/security-dast-full.yml).

The workflow runs on a disposable GitHub-hosted runner with local SQL Server,
Keycloak, and application services. It fails before scanning unless
`APP_BASE_URL` is exactly `http://localhost:3001`. A temporary Keycloak realm
contains a single throwaway user, `full.scan`, with Admin, PrivacyOfficer, and
Reviewer roles. Both authenticated and unauthenticated scans target `/sv`.

The app starts with `AI_REQUIREMENT_GENERATION_DISABLED=1` and empty OpenRouter
keys. Keep these safeguards when changing the workflow; active probes must
remain confined to disposable test state.

## Runbook

In GitHub Actions, select **Security DAST Full**, choose **Run workflow**, and
select the branch to assess. The job has a 120-minute timeout. Review these
artifacts:

- `zap-full-authenticated` and `zap-full-unauthenticated` for HTML, Markdown,
  and JSON reports.
- `zap-full-app-log` for application errors during probing.
- `zap-full-db-backup` for the SQL Server backup captured after scanner
  mutations.

The app log and database backup are retained for 14 days. Setup failures can
leave artifacts missing; inspect the failed step before treating missing
reports as a clean scan.

Both scan steps allow the job to continue so the workflow can collect evidence.
The final evaluation fails the job if either scan step failed. Inspect its logs
and reports to distinguish findings from scanner failures. Reports are uploaded
as artifacts; the scan does not create GitHub issues automatically.

Treat findings as not triaged until confirmed against the app and not only the
scanner payload. Suppress local-only noise in
[.github/zap/rules.full.tsv](../../.github/zap/rules.full.tsv) with a clear
comment. Escalate actionable rules only after the first manual runs are stable.

## Scheduling

Keep the workflow manual until at least three successful manual runs have been
reviewed. To enable weekly scanning, add a Sunday `04:00 UTC` schedule to the
workflow and document the baseline decision in this page and
[security-ci.md](./security-ci.md).
