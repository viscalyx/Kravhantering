# Application Action Audit Log

The application action audit log is a database-backed record of successful
state-changing actions and authorization denials. It complements, but does not
replace, the platform `security-audit` JSON log stream.

## Scope

Rows are written to `action_audit_events` for app-owned mutations such as
requirement create/edit/transition, specification/package changes, deviation
and improvement-suggestion decisions, Admin reference-data updates, privacy
erasure execution, archiving execution, access-review decisions, and
authorization denials.

The audit log intentionally excludes normal browsing, list/detail reads, report
and CSV exports of business artifacts, audit-log reads, audit-log CSV export,
and auth/session events.

## Data Shape

Each row contains:

- actor snapshot: `actor_hsa_id`, `actor_display_name`, `actor_kind`,
  `actor_client_id`
- action and target: dot-separated `action`, `target_kind`, `target_id`,
  optional `target_unique_id`
- result: `decision` (`allowed` or `denied`) and optional `denial_reason`
- tracing: `request_id`, `correlation_id`, and optional `client_ip`
- bounded `details_json`

`details_json` is restricted to operational metadata such as IDs, counts,
operation names, status IDs, tool names, and route/source. It must not contain
requirement text, prompts, comments, names, e-mail, target HSA-ID values,
tokens, secrets, or submitted free text.

## Failure Mode

Audit writes are fail-closed. If an audit insert fails, the mutation or denial
response fails instead of silently losing the audit row. Where the underlying
service owns a database transaction, the action-audit insert is executed in
that transaction.

## Admin Access

Admins can view the log at `/{locale}/admin/audit-log` or query
`GET /api/admin/audit-events`.

Supported filters:

- `actor_hsa_id`
- `action`
- `target_kind`
- `target_id`
- `client_ip`
- `decision`
- `from` / `to`
- `page` / `pageSize`
- `format=csv`

The audit-log read and CSV export do not themselves create audit rows.

## Privacy

`actor_hsa_id` and `actor_display_name` are data-subject actor snapshots. The
privacy preview/export/erasure workflow includes `action_audit_events.actor`.
Erasure preserves the row and may anonymize or switch only the actor personal
data. This is an explicit exception to strict append-only identity fidelity:
the row still preserves action, target, time, decision, request ID,
correlation ID, and non-personal details.

`client_ip` is operational forensic metadata derived from a validated
`X-Forwarded-For` candidate. It is useful only when the reverse proxy or ingress
controls that header. IP addresses are not included in the Privacy
preview/export/erasure workflow in this slice; retention and access are handled
through the action-audit retention decision and Admin-only audit-log access.
