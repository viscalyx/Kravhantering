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
  "operation": "ai.generate-requirements",
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
| `capacity.threshold_exceeded` | A flow exceeded its duration threshold. |
| `capacity.throttled` | A request was blocked by throttling. |

Safe metrics may be included when relevant:

- `duration_ms`
- `item_count`
- `image_count`
- `image_bytes`
- `token_count`
- `cost`
- `throttled`
- `retry_after_seconds`

The capacity log must not contain prompts, requirement text, images, raw query
strings, tokens, secrets, or HSA IDs.

## Measured Flows

V1 measures:

- AI-assisted authoring through `/api/ai/generate-requirements`.
- AI metadata through `/api/ai/models` cache misses, `refresh=1`, and
  `/api/ai/credits`.
- AI-assisted authoring through the MCP tool `requirements_generate_requirements`.
- Shared service operations through service logging.
- Server-side report item loading for the specification report.
- Server-side PDF rendering for requirement, specification, privacy, and
  access-review exports.

Report PDFs are rendered in Node route handlers so production CSP can stay
strict without `unsafe-eval` or `wasm-unsafe-eval`. V1 does not impose an
application-level item-count cap on report lists. Large report PDFs remain
server workload for capacity planning; practical constraints are request URL
length, data loading time, and PDF rendering capacity.

## Throttling

V1 uses process-local in-memory throttling:

- AI-assisted authoring: 5 requests per minute per actor/process.
- AI model metadata refreshes and cache misses: 10 requests per minute per
  actor/process.
- AI credit lookup: 20 requests per minute per actor/process.

When a limit is reached, REST flows respond with `429` and `Retry-After`. MCP
flows return a tool error and log `capacity.throttled`.

This solution is not distributed. In scaled production, throttling must move to
SQL Server, Redis, or a platform rate-limiting capability.

## Recommended Alerts

- `capacity.operation.failed` above 5 percent for AI flows over 15 minutes.
- More than 20 `capacity.throttled` events over 10 minutes.
- p95 `duration_ms` above 30 seconds for AI-assisted authoring.
- p95 `duration_ms` above 10 seconds for report data.
- Rising daily `cost` or `token_count` for AI-assisted authoring.

Operations is responsible for setting environment-specific thresholds and
reviewing capacity data at least monthly or before major releases.
