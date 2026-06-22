# AI-Assisted Authoring Developer Workflow

This document covers local OpenRouter setup and test policy for AI-assisted
requirement generation. Behavioral contracts for prompts, provider requests,
taxonomy loading, and generated-requirement validation live in
[reference-data-and-ai.md](../governance/reference-data-and-ai.md).

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
