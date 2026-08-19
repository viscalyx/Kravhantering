# AI-Assisted Authoring Developer Workflow

This document covers local adapter setup and test policy for AI-assisted
requirement generation. Behavioral contracts for prompts,
provider requests, taxonomy loading, and generated-requirement validation live in
[reference-data-and-ai.md](../governance/reference-data-and-ai.md).

## Integration Architecture

Every bounded AI request runs through the provider-neutral integration layer in
[ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).
An administrator-controlled run profile selects an AI connection and a
verified AI connection model revision before the adapter runs. Application
routes and business services do not select providers, models, transports, or
provider configuration.

The runtime resolver reads the active revision for exactly one of the three
fixed profile slots in a single SQL Server query. It rejects missing,
suspended, or derived-blocked profiles before resolving transient adapter
configuration. The exact connection, model revision, profile revision, adapter
version, and capability selection are frozen for the run. `disabled`
capabilities are never selected, `allowed` capabilities are selected only when
the model revision verifies them, and missing `required` capabilities block the
profile. Verified validatable JSON remains mandatory independently of optional
strict JSON Schema steering.

Adapter-ready connection and model configuration exists only inside the
resolver's opaque configuration callback; it is not returned on the resolved
profile. The callback remains open until the adapter event stream has been
fully consumed, so provider-secret access stays inside that lifetime boundary.
The integration layer releases and settles that scope before publishing the
single buffered terminal event; teardown failure replaces it with one safe
failed terminal.
Neither the profile source nor the integration layer interprets
provider-specific authentication fields. The integration layer invokes only
the exact registered adapter type-and-version pair and does not retry through
or fall back to another adapter. Multiple registered versions of one adapter
type remain independent selections.

OpenRouter remains the first adapter, alongside a fully registrable controlled
test adapter. Both pass the same run-profile, safety-gate, route, and terminal
outcome contracts. The trust boundary, AI connection lifecycle, encrypted
provider secrets, and external root keyring are governed by
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

<!-- markdownlint-disable MD013 -->
![Technical infographic showing AI-assisted authoring in Kravhantering. The flow illustrates how user input is checked, processed through an LLM integration layer, sent to OpenRouter, validated, and reviewed by a human before being imported into a requirements library or requirements document.](../images/ai-assisted-authoring-llm-integration-architecture.png)
<!-- markdownlint-enable MD013 -->

## Local Adapter Setup

AI-assisted authoring is available only when an administrator has activated a
valid profile for that exact action. Local development uses the same connection,
secret, verification, and profile workflow as production.

1. Provision the ignored local provider-secret root keyring:

   ```bash
   node scripts/provision-ai-provider-secret-keyring.mjs
   ```

2. Configure the deployment-owned egress, data, and TLS policy maps described in
   [AI Connections Operations](../operations/ai-connections.md).
3. In Admin Center under `AI`, register a connection, write its provider secret,
   run the connection checks, verify an immutable model revision, and activate
   the connection.
4. Activate separate run-profile revisions for generation without images,
   generation with images, and invalid-import repair as needed.
5. Confirm the authoring dialog shows only the connection's public name and
   data-policy summary. Missing, suspended, or blocked profiles disable only
   their corresponding action.

Provider credentials are written through the administrator workflow and stored
as encrypted revisions. Do not put provider credentials in environment files or
browser-visible configuration. The authoring UI does not select models or show
provider credits.

AI-assisted requirement generation is enabled by default after migrations. An
administrator can turn generation off in Admin Center under `AI`. That setting
disables AI-assisted authoring across the requirements UI and REST routes.

Verify local setup against the app API:

```bash
scripts/dev-curl.sh -s /api/ai/authoring-profiles | jq .
```

Do not commit provider credentials or the generated root keyring.

## Adapter Test Policy

Automated repository tests and security gates do not call live provider
endpoints. External providers are tested outside the repository; repository
tests use the controlled adapter or mock the adapter-owned transport boundary.

The repo-owned responsibility is to verify the integration boundary:

- adapter request shape, response parsing, timeout handling, and error handling
  with mocked transport calls;
- prompt and taxonomy generation behavior before a provider call is made;
- action-scoped behavior when a profile or encrypted credential is unavailable;
- sanitization so provider keys, prompts, SQL fragments, stack traces, and
  other sensitive details are not written to scan artifacts.

The production-boundary acceptance test uses an encrypted controlled-adapter
scenario through the persisted profile source, transient credential scope,
trust boundary, run coordinator, and real authoring route projection. It does
not replace the HTTP endpoints with route mocks. Adapter deltas stay
quarantined. A safe-screened schema-invalid terminal becomes the neutral
`invalid_output` event, which the generation route projects as
`validation_error` with the preserved raw result and validation issues so the
repair action can continue without exposing unscreened or partial output.

Do not add production provider secrets or live provider calls to CI. A manual
provider smoke test may be run outside CI when changing provider configuration
or investigating an integration incident.

## Provider Failure Contract

The authoring routes project adapter failures into stable response contracts.
JSON responses return `{ code, error }` and SSE error events return
`{ code, message }`. Request and correlation identifiers remain in response
headers rather than error payloads.
An upstream rate limit detected before streaming begins returns HTTP `429`;
other provider failures return HTTP `503`.

Provider failures use these codes:

- `ai_profile_missing`, `ai_profile_suspended`, and `ai_profile_blocked` for an
  action profile that changes between availability lookup and execution;
- `ai_provider_rate_limited` for upstream `429`;
- `ai_provider_unavailable` for unavailable connections and remaining adapter
  failures;
- `ai_provider_invalid_response` for a terminal response that cannot be used
  or preserved for repair.

Error bodies are inspected only for JSON media types and stop at 16 KiB.
Successful JSON bodies stop at 4 MiB. SSE frames stop at 256 KiB, and combined
model content plus reasoning stops at 4 MiB. Diagnostics use the
`ai-provider-observability` channel and contain only stable codes, operation,
gateway, validated provider/status/identifier fields, content-type category,
observed byte count, and truncation state. They never contain provider body
text, prompts, model output, personal data, secrets, or nested exception text.

Caller cancellation produces no provider error payload or provider-failure
diagnostic.

## Security Scan Disable Guard

Full active DAST runs set `AI_REQUIREMENT_GENERATION_DISABLED=1`. This is a
runtime guard for security scans and deployment freeze windows, not an
administrator preference. It has higher precedence than the Admin Center
setting and cannot be bypassed through the UI. Administrators may still save
the persisted preference while the guard is active, but effective generation
stays disabled until the environment variable is removed.

When the environment guard or the persisted Admin Center preference disables
generation, REST and MCP AI-assisted authoring keep their public route/tool
contracts but return the sanitized provider-unavailable response before
taxonomy loading or adapter egress starts.

Security CI must not provision an active provider secret or authoring profile,
so accidental adapter access fails closed even if the guard is removed or
misconfigured.
