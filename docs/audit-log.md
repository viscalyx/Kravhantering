# Application Action Log

The application action log is a database-backed record of successful
state-changing actions and authorization denials. It complements, but does not
replace, the platform `security-audit` JSON log stream.

## Scope

Rows are written to `action_audit_events` for app-owned mutations such as
requirement create/edit/transition, specification/package changes, deviation
and improvement-suggestion decisions, Admin taxonomy and status-catalog
updates, privacy erasure execution, archiving execution, access-review
decisions, and authorization denials. System-derived cleanup of
requirement-selection answer
links is also logged when requirement package archiving/deletion, retention, or
requirement publication-state changes remove obsolete links.

The action log intentionally excludes normal browsing, list/detail reads, report
and CSV exports of business artifacts, action-log reads, action-log CSV export,
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

Requirement-selection cleanup events use action
`requirement_selection_answer.cleanup`, actor kind `system`, and target kind
`requirement_selection_answer`. Their details contain only link counts,
affected answer IDs, affected package/requirement IDs, source action, and route
or retention metadata. They reuse the surrounding request and correlation IDs
when cleanup happens inside a user-triggered mutation.

## Failure Mode

Action-log writes are fail-closed. If an action-log insert fails, the mutation
or denial response fails instead of silently losing the action-log row. Where
the underlying service owns a database transaction, the action-audit insert is
executed in that transaction.

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
- `locale` (`en` or `sv`) for CSV labels; omitted locale defaults to English

The action-log read and CSV export do not themselves create action-log rows.
CSV downloads use UTF-8 with BOM, localize column headers and decision values
for the requested locale, and keep action names, target kinds, request IDs and
details JSON as stored evidence identifiers.

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
through the action-log retention decision and Admin-only action-log access.
