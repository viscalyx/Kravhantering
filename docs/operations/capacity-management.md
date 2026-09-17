# Capacity Management

<!-- cSpell:words traceparent -->

Use this guide to configure capacity dashboards and alerts, size export
storage, and diagnose throttling in production. It is intended for operators
collecting application logs through the platform log pipeline.

## Event Flow

The application does not send events directly to an external service. Instead,
it writes one JSON line per event to stdout or stderr:

```json
{
  "channel": "capacity-observability",
  "ts": "2026-05-14T12:00:00.000Z",
  "level": "info",
  "event": "capacity.operation.completed",
  "event_id": "bcb79b16-4f24-4f92-8d0f-94afcf8e04c7",
  "request_id": "request-1",
  "correlation_id": "workflow-1",
  "source": "rest",
  "operation": "ai.generate-requirement-import",
  "outcome": "success",
  "duration_ms": 4120,
  "status_code": 200
}
```

The external service should filter on
`channel == "capacity-observability"` and use the log platform to build
dashboards, alerts, and retention policies. Security audit events remain on the
separate `security-audit` channel.

## Identifiers

- `request_id` identifies one HTTP or MCP request.
- `correlation_id` tracks a workflow across multiple events. The application
  uses `X-Correlation-Id` when present, otherwise the trace ID from
  `traceparent` , otherwise
  `request_id`.
- `event_id` is unique for each capacity event.

Client-provided identifiers are sanitized and used only for traceability. They
must never be used for authorization or trust decisions.

## Events And Metrics

The following events are available:

<!-- markdownlint-disable MD013 -->

| Event | Purpose |
| --- | --- |
| `capacity.operation.completed` | A measured flow completed. |
| `capacity.operation.failed` | A measured flow failed. |
| `capacity.operation.cancelled` | The client cancelled measured work. |
| `capacity.threshold_exceeded` | A duration, item, or byte limit was exceeded. |
| `capacity.throttled` | A request was blocked by throttling. |

<!-- markdownlint-enable MD013 -->

Safe metrics may be included when relevant:

- `duration_ms`
- `item_count`
- `byte_count`
- `item_limit`
- `byte_limit`
- `timeout_ms`
- `active_count`
- `concurrency_limit`
- `worker_memory_limit_bytes`
- `returned_count`
- `page_limit`
- `continuation_available`
- `image_count`
- `image_bytes`
- `token_count`
- `cost`
- `throttled`
- `retry_after_seconds`

The capacity log must not contain prompts, requirement text, images, raw query
strings, cursor values, filters, requirements specification or Requirement IDs,
tokens, secrets, HSA-id values, or other user identity.

## Measured Flows

Measured flows include:

- AI-assisted authoring through `/api/ai/generate-requirement-import`.
- JSON repair through `/api/ai/repair-requirement-import-json`.
- Shared service operations through service logging.
- Requirements specification item pages for the `editor-preload`, `rest`, and
  `mcp` surfaces. These events use
  `operation == "requirements.get_specification_items"` and include duration,
  returned count, effective page limit, continuation availability, outcome,
  and only the bounded `invalid_cursor` failure category when applicable.
- Requirements Library pages for the `editor-preload`, `rest`, and `mcp`
  surfaces. These use `requirements.library_page.list` or
  `requirements.library_page.search` and record duration, returned count, page
  limit, continuation availability, outcome, and only the bounded
  `invalid_cursor` failure category.
- Server-side report item loading for the specification report.
- Server-side PDF rendering for requirement, specification, privacy, and
  access-review exports.

PDF exports share the Admin-configured item, byte, timeout, and per-node
concurrency limits. The worker-memory limit applies only to PDFs rendered in
isolated workers, including the large requirements-list and privacy PDFs.
Requirements Library CSV, requirements-specification CSV, Action-log CSV,
and privacy JSON share the CSV limits and per-node concurrency pool.
Configure these limits in Admin Center before increasing workload or scaling
nodes. Each generation uses a settings snapshot; changes apply to subsequent
operations.

The PDF item limit counts distinct requirements for selected reports,
versions for history and review, versions plus suggestions for suggestion
history, and top-level rows for list, specification, traceability, RFI,
access-review, and data-subject reports. For a data-subject report it counts
exported data items rather than requirements. The exact limit is accepted.

These flows use `operation == "admin.action_log_csv_export"`,
`operation == "privacy.data_subject_json_export"`,
`operation == "privacy.data_subject_pdf_export"`,
`operation == "requirements.library_csv_export"`,
`operation == "requirements.specification_csv_export"`, or
`operation == "requirements.list_pdf_report"` with `surface == "export"` or
`surface == "report"` and `source == "rest"`. Both specification profiles use
the same operation name. The `capacity_reason` field identifies failures such as
`item_limit_exceeded`, `byte_limit_exceeded`, `generation_timeout`,
`temporary_storage_unavailable`, `worker_memory_exceeded`, `worker_failed`,
`client_cancelled`, or `concurrency_limit`. Use it to distinguish a configured
limit from storage or worker failure.

Generated files are written before response headers to a private spool root
selected by `KRAVHANTERING_EXPORT_TEMP_DIR`, or the operating-system temporary
directory when the variable is unset or blank. Operation directories use mode
`0700`; files use `0600`. An explicitly configured base directory must be
absolute, already exist, remain inaccessible to other users, and grant the
non-root
operating-system account under which the Node.js process runs read, write, and
search access. An app-owned directory with mode `0700` meets that contract.
Logical maximum bytes are reserved against current filesystem capacity before
generation. Files are removed after complete transfer, cancellation, or error,
and stale owned operation directories older than 15 minutes are removed when
the process first acquires export storage. `/api/ready` fails its sanitized
`temporary_storage` check when the runtime cannot create, write, close, and
remove a probe file.

Size free storage on each node for at least the configured CSV concurrency
multiplied by its maximum file size, plus PDF concurrency multiplied by its
maximum file size, with additional headroom. When processes share a filesystem,
include every process in that budget; storage reservations are process-local.

Successful file responses set exact `Content-Length`,
`Cache-Control: no-store`, and `X-Accel-Buffering: no`. Production Nginx grants
the Requirements Library CSV, numeric requirements-specification CSV, and
localized list-PDF routes a 660-second read timeout, leaving 60 seconds of
proxy margin over the maximum 600-second application setting.

## Throttling

AI-assisted authoring and JSON repair each allow 5 requests per minute per
actor/process. These request throttles are separate from the SQL-coordinated
AI execution admission described in the [AI connections runbook](./ai-connections.md).

Exports and reports also enforce SQL-coordinated limits per actor across all
nodes and output formats. Admin Center configures starts per rolling minute
and active operations; the defaults are 10 starts and 1 active operation.
Admission remains held through file delivery. Rate rejection returns
`429 actor_rate_limit` with `Retry-After`; active-work rejection returns
`429 actor_concurrency_limit` without an estimated retry time. SQL coordination
failure returns `503 quota_check_unavailable` with `Retry-After: 5`, with no
local fallback. Monitor `operation == "generated_output.actor_admission"`
and its `capacity_reason` field separately from per-node generation capacity.

An export's overall lifetime is limited to 12 minutes, including delivery.
If admitted work still cannot settle, a watchdog terminates the application
process at 14 minutes, before SQL admission recovery at 15 minutes. Ensure the
runtime supervisor restarts terminated processes and investigate repeated
restarts alongside export failures.

HSA person verification uses a SQL Server-backed quota shared by every app
node: 50 requests per actor, 10 per actor-target combination, and 10 per target
in a minute-aligned
60-second fixed window. Evaluation stops at the first denied bucket. A denial
emits identity-free `capacity.throttled` with retry time. SQL coordination
failure emits identity-free `capacity.operation.failed`, returns generic `503`
with `Retry-After: 5`, and must alert operators; there is no process-local
fallback.

Generated output uses `429 capacity_busy` with `Retry-After: 5` when its
process-local concurrency slot is unavailable. Item and completed-file limits
return `422 output_limit_exceeded`. Generated-output error responses with status
`422`, `429`, and `503` include `Cache-Control: no-store`. Operators should tell
users to reduce selected rows or narrow report filters before retrying an
item-limit rejection. Timeout, temporary-storage, worker-memory, and unexpected
worker failures return stable `503` error codes. Client cancellation stops
cancellation-aware upstream work, keeps any non-cancellable direct render
admitted until it settles, and exposes no response body.

Per-node output concurrency protects each process in addition to the shared
actor quota. Scaling nodes increases aggregate generation capacity but does
not increase an actor's shared allowance.

## Recommended Alerts

The provider-neutral AI integration uses distributed queue, retry, and
circuit-breaker coordination for AI connections. Its required operator alerts
and recovery boundary are documented in the
[AI connections runbook](./ai-connections.md).

- `capacity.operation.failed` above 5 percent for AI flows over 15 minutes.
- More than 20 `capacity.throttled` events over 10 minutes, grouped by
  operation and `capacity_reason`.
- Any `quota_check_unavailable` failure for
  `generated_output.actor_admission`; check SQL availability, permissions,
  and lock pressure.
- Repeated `temporary_storage_unavailable` failures; check free space,
  configured spool-directory access, and `/api/ready`.
- Any `capacity.operation.failed` event for
  `requirements.hsa_verification`; correlate it with SQL Server availability,
  migration readiness, runtime permissions, and lock pressure.
- p95 `duration_ms` above 30 seconds for AI-assisted authoring.
- p95 `duration_ms` above 10 seconds for report data.
- Rising daily `cost` or `token_count` for AI-assisted authoring.

Operations is responsible for setting environment-specific thresholds and
reviewing capacity data at least monthly or before major releases.
