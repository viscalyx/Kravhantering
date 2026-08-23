# Capacity Management

<!-- cSpell:words traceparent -->

This document describes the v1 support for capacity measurements, alerting
signals, and throttling in Kravhantering. The implementation addresses action
5 by writing structured JSON events that an external logging, SIEM, or APM
service can collect through the platform log pipeline.

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
  uses `X-Correlation-Id` when present, otherwise `traceparent`, otherwise
  `request_id`.
- `event_id` is unique for each capacity event.

Client-provided identifiers are sanitized and used only for traceability. They
must never be used for authorization or trust decisions.

## Events And Metrics

The following events are used in v1:

| Event | Purpose |
| --- | --- |
| `capacity.operation.completed` | A measured flow completed. |
| `capacity.operation.failed` | A measured flow failed. |
| `capacity.operation.cancelled` | The client cancelled measured work. |
| `capacity.threshold_exceeded` | A flow exceeded its duration threshold. |
| `capacity.throttled` | A request was blocked by throttling. |

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

V1 measures:

- AI-assisted authoring through `/api/ai/generate-requirement-import`.
- AI authoring-profile availability and terminal generation outcomes.
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

The large requirements-list PDF and privacy PDF are rendered in isolated Node
worker threads from production-bundled renderers so production CSP can stay
strict without `unsafe-eval` or `wasm-unsafe-eval`. All PDFs share the
Admin-configured PDF item, byte, timeout, and process-local per-node concurrency
limits. The worker-memory limit applies only to PDFs rendered in isolated Node
worker threads; direct `renderToBuffer` renderers do not enforce that setting.
Requirements Library CSV, procurement and full requirements-specification CSV,
Action-log CSV, and privacy JSON use the CSV item, byte, timeout, and shared
process-local structured-export pool. Each operation uses one database settings
snapshot.

The PDF item setting counts distinct requirement IDs for selected reports,
versions for history and review, versions plus suggestions for suggestion
history, and top-level rows for list, specification, traceability, RFI,
access-review, and data-subject reports; for a data-subject report it counts
exported data items rather than requirements. The exact limit is accepted. Bounded
collectors request no more than the limit plus one before broad enrichment.
Privacy PDF rendering is terminable on deadline or request cancellation. Other
direct PDF renderers require active capacity admission and do not release that
admission until abandoned React-PDF work settles.

These flows use `operation == "admin.action_log_csv_export"`,
`operation == "privacy.data_subject_json_export"`,
`operation == "privacy.data_subject_pdf_export"`,
`operation == "requirements.library_csv_export"`,
`operation == "requirements.specification_csv_export"`, or
`operation == "requirements.list_pdf_report"` with `surface == "export"` or
`surface == "report"` and `source == "rest"`. Both specification profiles use
the same operation name. Terminal reason is one of
`item_limit_exceeded`, `byte_limit_exceeded`, `generation_timeout`,
`temporary_storage_unavailable`, `worker_memory_exceeded`, `worker_failed`,
`client_cancelled`, or `concurrency_limit`. Action-log CSV telemetry includes
only the common bounded metrics and operation name. Events never include raw
errors, temporary paths, filters, identities, action-log contents, requirement
IDs, or requirement text.

Generated files are written before response headers to a private spool root
selected by `KRAVHANTERING_EXPORT_TEMP_DIR`, or the operating-system temporary
directory when the variable is unset or blank. Operation directories use mode
`0700`; files use `0600`. An explicitly configured base directory must already
exist, remain inaccessible to other users, and grant the non-root
operating-system account under which the Node.js process runs read, write, and
search access. An app-owned directory with mode `0700` meets that contract.
Logical maximum bytes are reserved against current filesystem capacity before
generation. Files are removed after complete transfer, cancellation, or error,
and stale owned operation directories older than 15 minutes are removed on
startup. `/api/ready` fails its sanitized `temporary_storage` check when the
runtime cannot create, write, close, and remove a probe file. Each application
process shares concurrent readiness work and caches the completed aggregate
result for five seconds, reducing repeated database, schema, storage, and OIDC
load without enabling HTTP cache reuse.

Successful file responses set exact `Content-Length`,
`Cache-Control: no-store`, and `X-Accel-Buffering: no`. Production Nginx grants
the Requirements Library CSV, numeric requirements-specification CSV, and
localized list-PDF routes a 660-second read timeout, leaving 60 seconds of
proxy margin over the maximum 600-second application setting.

Requirements-specification CSV reuses the existing
`KRAVHANTERING_EXPORT_TEMP_DIR` environment contract and storage-sizing
formula. It adds no environment variable or separate storage reservation.

## Throttling

V1 uses process-local in-memory throttling:

- AI-assisted authoring: 5 requests per minute per actor/process.
- AI model metadata refreshes and cache misses: 10 requests per minute per
  actor/process.
- AI credit lookup: 20 requests per minute per actor/process.

When a limit is reached, REST flows respond with `429` and `Retry-After`. MCP
flows return a tool error and log `capacity.throttled`.

Generated output uses `429 capacity_busy` with `Retry-After: 5` when its
process-local concurrency slot is unavailable. Item and completed-file limits
return `422 output_limit_exceeded`. Generated-output error responses with status
`422`, `429`, and `503` include `Cache-Control: no-store`. Operators should tell
users to reduce selected rows or narrow report filters before retrying an
item-limit rejection. Timeout, temporary-storage, worker-memory, and unexpected
worker failures return stable `503` error codes. Client cancellation stops
cancellation-aware upstream work, keeps any non-cancellable direct render
admitted until it settles, and exposes no response body.

Actor- and target-based request throttles are process-local guardrails, not
cross-node quotas. Scaled deployments account for their limits per instance
and can add platform rate limiting when a shared request quota is required.
Generated-output admission remains deliberately per node, while AI execution
uses its separately documented SQL-coordinated admission model.

## Recommended Alerts

The provider-neutral AI integration uses distributed queue, retry, and
circuit-breaker coordination for AI connections. Its required operator alerts
and recovery boundary are documented in the
[AI connections runbook](./ai-connections.md). The run-profile and adapter
contract is [ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).

- `capacity.operation.failed` above 5 percent for AI flows over 15 minutes.
- More than 20 `capacity.throttled` events over 10 minutes.
- p95 `duration_ms` above 30 seconds for AI-assisted authoring.
- p95 `duration_ms` above 10 seconds for report data.
- Rising daily `cost` or `token_count` for AI-assisted authoring.

Operations is responsible for setting environment-specific thresholds and
reviewing capacity data at least monthly or before major releases.
