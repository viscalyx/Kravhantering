# AI-Assisted Authoring Developer Workflow

This document covers local OpenRouter setup and test policy for AI-assisted
requirement generation. Behavioral contracts for prompts, provider requests,
taxonomy loading, and generated-requirement validation live in
[reference-data-and-ai.md](../governance/reference-data-and-ai.md).

<!-- markdownlint-disable MD013 -->
![Technical infographic showing AI-assisted authoring in Kravhantering. The flow illustrates how user input is checked, processed through an LLM integration layer, sent to OpenRouter, validated, and reviewed by a human before being imported into a requirements library or requirements document.](../images/ai-assisted-authoring-llm-integration-architecture.png)
<!-- markdownlint-enable MD013 -->

## Local OpenRouter Setup

AI-assisted requirement generation is disabled unless local OpenRouter
credentials are present.

1. Get an API key at <https://openrouter.ai/keys>.
2. Add it to `.env.development.local`:

   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. Optionally set `OPENROUTER_MGMT_API_KEY` when testing organization credit
   display.
4. Restart the dev server. The AI modal shows available models after the app can
   read the configured key.

Devcontainer profiles do not forward OpenRouter keys from the workstation. A
key in `.env.development.local` is not exported as a general VS Code remote
environment variable, but VS Code extensions, terminal commands, and other
remote processes with workspace access can still read the file. Treat the file
as local credential storage, not as an isolation or security boundary.

AI-assisted requirement generation is enabled by default after migrations. An
administrator can turn generation off in Admin Center under `AI`. That setting
disables the requirements-library action, the generator modal, the REST
generation route, and the MCP generation tool while leaving model and credit
read endpoints available for diagnostics.

Verify local setup against the app API:

```bash
scripts/dev-curl.sh -s /api/ai/models | jq '.models | length'
scripts/dev-curl.sh -s /api/ai/credits | jq .
```

Do not commit real OpenRouter keys.

## OpenRouter Test Policy

Automated repository tests and security gates do not call live OpenRouter
endpoints. OpenRouter is an external service, and this project assumes the
provider's published API works independently of the repository.

The repo-owned responsibility is to verify the integration boundary:

- request shape, model selection, response parsing, timeout handling, and error
  handling with mocked network calls;
- prompt and taxonomy generation behavior before a provider call is made;
- disabled-provider behavior when OpenRouter credentials are absent;
- sanitization so provider keys, prompts, SQL fragments, stack traces, and
  other sensitive details are not written to scan artifacts.

Do not add production OpenRouter keys or live provider calls to CI. A manual
provider smoke test may be run outside CI when changing provider configuration
or investigating an integration incident.

## Provider Failure Contract

All OpenRouter operations use the same bounded provider-response readers and
stable failure classification. JSON responses return `{ code, error }` and SSE
error events return `{ code, message }`. Request and correlation identifiers
remain in response headers rather than error payloads.
An upstream rate limit detected before streaming begins returns HTTP `429`;
other provider failures return HTTP `503`.

Provider failures use these codes:

- `ai_provider_configuration_error` for missing configuration and upstream
  request/configuration `4xx` responses;
- `ai_provider_rate_limited` for upstream `429`;
- `ai_provider_timeout` for provider or application deadlines;
- `ai_provider_unavailable` for network and remaining upstream `5xx` failures;
- `ai_provider_invalid_response` for missing, unexpected, malformed, or
  incomplete responses;
- `ai_provider_response_too_large` when a response bound is exceeded;
- `ai_provider_response_read_failed` when an upstream body cannot be read.

Error bodies are inspected only for JSON media types and stop at 16 KiB.
Successful JSON bodies stop at 4 MiB. SSE frames stop at 256 KiB, and combined
model content plus reasoning stops at 4 MiB. Diagnostics use the
`ai-provider-observability` channel and contain only stable codes, operation,
gateway, validated provider/status/identifier fields, content-type category,
observed byte count, and truncation state. They never contain provider body
text, prompts, model output, personal data, secrets, or nested exception text.

Caller cancellation produces no provider error payload or provider-failure
diagnostic. An unavailable optional purchased-credit lookup leaves
`totalCredits` as `null` when the primary key-information request succeeds.

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
taxonomy loading, OpenRouter model-catalog, or chat-completion calls are made.

Use empty `OPENROUTER_API_KEY` and `OPENROUTER_MGMT_API_KEY` in security CI as
well, so accidental provider access fails closed even if the guard is removed
or misconfigured.
