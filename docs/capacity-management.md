# Capacity Management

<!-- cSpell:words Grafana LogRecords OpenTelemetry OTLP api lgtm traceparent -->

This document describes the v1 support for capacity measurements, alerting
signals, throttling, and optional OpenTelemetry export in Kravhantering. The
default path writes structured JSON events that an external logging, SIEM, or
APM service can collect through the platform log pipeline.

## Event Flow

By default, the application writes one JSON line per event to stdout or stderr:

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

OpenTelemetry export is disabled unless `OTEL_SDK_ENABLED=true` and an OTLP
endpoint is configured. When enabled, the same sanitized capacity payload is
also exported as:

- a short span named `capacity <operation>`
- metrics under `kravhantering.capacity.*`
- a LogRecord for the capacity event

The JavaScript OpenTelemetry Logs Bridge package is isolated to the capacity
adapter because it is still documented as alpha upstream. JSON logs remain the
stable fallback and are still enabled when OTel is enabled.

## Environment Configuration

Development defaults enable OpenTelemetry against the local LGTM stack. Use the
host-mapped endpoint when the Next.js process runs directly on the host:

```dotenv
OTEL_SDK_ENABLED=true
OTEL_SERVICE_NAME=kravhantering
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
CAPACITY_JSON_LOGS_ENABLED=true
```

When the app runs inside the devcontainer or another Docker Compose network,
use the service name endpoint instead:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318
```

The committed devcontainer compose files inject that container endpoint for the
`app` service, so `.env.development` can stay usable for host-based development.

Deployments must opt in explicitly. Setting only
`OTEL_EXPORTER_OTLP_ENDPOINT` is not enough; `OTEL_SDK_ENABLED` must be
exactly `true`.

JSON capacity logs are controlled separately:

- unset or any value except `false`: JSON logs are written
- `CAPACITY_JSON_LOGS_ENABLED=false`: capacity JSON logs are not written

Only disable JSON capacity logs after OTel logs and dashboards have been
verified in the target environment.

## Local Grafana LGTM

Host-based development can start the local observability stack with:

```bash
docker compose -f docker-compose.otel.yml up -d
```

The devcontainer starts the same `grafana/otel-lgtm` service as part of its
Compose project. The local ports are:

- Grafana: `http://localhost:3300`
- OTLP gRPC: `localhost:4317`
- OTLP HTTP: `localhost:4318`

The Grafana dashboard
`Kravhantering Capacity Observability` is provisioned from
`dev/grafana/provisioning/dashboards`. It includes panels for:

- event volume by event, operation, source, and outcome
- success, failure, threshold, and throttling rates
- p50, p95, and p99 duration by operation
- status code distribution
- item, image, token, and cost trends
- recent capacity LogRecords
- trace drilldown for capacity spans

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

OpenTelemetry metrics intentionally do not use `request_id`,
`correlation_id`, or `event_id` as metric labels. Those identifiers are kept on
spans and LogRecords only, to avoid high-cardinality metrics.

## Measured Flows

V1 measures:

- AI generation through `/api/ai/generate-requirements`.
- AI metadata through `/api/ai/models` cache misses, `refresh=1`, and
  `/api/ai/credits`.
- AI generation through the MCP tool `requirements_generate_requirements`.
- Shared service operations through service logging.
- Server-side report item loading for the specification report.

Report PDF rendering happens in the browser. V1 therefore measures server-side
data collection and limits report lists to 50 items.

## Throttling

V1 uses process-local in-memory throttling:

- AI generation: 5 requests per minute per actor/process.
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
- p95 `duration_ms` above 30 seconds for AI generation.
- p95 `duration_ms` above 10 seconds for report data.
- Rising daily `cost` or `token_count` for AI generation.

Operations is responsible for setting environment-specific thresholds and
reviewing capacity data at least monthly or before major releases.

Operations also owns production collector/exporter routing, sampling, dashboard
promotion, and retention. A typical deployment uses `OTEL_TRACES_SAMPLER` and
`OTEL_TRACES_SAMPLER_ARG` to tune trace volume, and collector-side policies for
log retention and downstream export.
