# Platform-Routed Capacity Observability

Status: Accepted on 2026-06-05.

Kravhantering records capacity measurements, threshold breaches and
throttling as bounded structured JSON log events on
`channel: "capacity-observability"`. The application emits the signal, but
the hosting platform owns log collection, dashboards, alerts, retention and
SIEM or APM delivery.

This keeps capacity observability separate from the application `Åtgärdslogg`
and from the `Säkerhetslogg` stream. Capacity events may include safe metrics
such as duration, item counts, token counts, cost and retry-after seconds, but
must not include prompts, requirement text, images, raw query strings, tokens,
secrets or HSA IDs.

V1 throttling is process-local and in-memory. It is suitable as an application
guardrail and capacity signal, but scaled production throttling must move to
SQL Server, Redis or a platform rate-limiting capability.

## Considered Options

- Store capacity events in the application database: rejected because
  dashboards, retention and alerting belong to the platform log pipeline, and
  capacity data should not expand the app-owned audit evidence model.
- Send events directly to a specific external APM or SIEM service: rejected
  because it would couple Kravhantering to one operations tool instead of the
  hosting platform's log pipeline.
- Treat in-memory throttling as the final production architecture: rejected
  because process-local counters do not coordinate across scaled instances.
