# AISVS AI and MCP Control Mapping

<!-- cSpell:ignore AISVS OpenRouter jsonrpc RAG toolnames -->

This document is the source of truth for issue `#348`: adopting
[OWASP AISVS v1.0](https://github.com/OWASP/AISVS) as an assurance overlay for
Kravhantering's AI-assisted authoring and Model Context Protocol surfaces.

AISVS is not a replacement for the existing app-security program. It overlays
the controls that are specific to AI prompts, model output, orchestration, MCP
transport, and AI safety monitoring.

## Scope

The target assurance scope is AISVS Level 1 plus selected Level 2 controls for
surfaces that exist in the product:

- AI-assisted requirement authoring and JSON repair.
- OpenRouter model invocation and model capability resolution.
- The `/api/mcp` Streamable HTTP endpoint and documented MCP tools.
- Metadata-only AI, MCP, auth, capacity, and security audit logging.

Out of scope until the product adds those capabilities:

- Model training, fine-tuning, or model hosting.
- Retrieval-augmented generation, vector databases, embeddings, or memory
  stores.
- Autonomous multi-step agent execution outside the current MCP tool calls.
- Browser plugins, client-side model execution, and external classifier
  runtime dependencies.

## Implemented Baseline

AI input is screened locally before any model-catalog or chat-completion work.
The current deterministic screen detects obvious instruction override,
attempts to extract non-public prompt/backend material, encoded smuggling tied
to override terms, secret extraction, and harmful-generation requests. It does
not block requests for the AI request text that the AI-assisted authoring UI
intentionally exposes in its request-explanation dialog. That distinction keeps
AISVS prompt-injection evidence aligned with the product transparency model:
visible app instructions are inspectable, while control override and hidden /
backend instruction extraction remain blocked. It screens `need`, repair
`rawJson`, repair `errors`, and image MIME metadata. It does not send prompts
or content to a live external classifier. Service options are summarized in
[AI Safety Classifier Services Research](./ai-safety-classifier-services-research.md).

AI output is screened before raw model output is emitted. The streaming route
buffers model text until final safety and schema validation complete. Unsafe
output returns a safe error message without echoing `rawContent`, `thinking`,
or validation-error payloads. Repair output is screened before schema
validation and response serialization.

AI safety decisions use the JSON `security-audit` log stream through
`lib/auth/audit.ts`, not the database action log. Events are metadata only:
operation, decision, rule IDs, categories, source, request/correlation IDs,
and model/provider when available. They do not contain the prompt, model
output, repair JSON, image data, or actor HSA-id in event detail.

MCP requests default to a `1 MiB` HTTP payload limit that Admins can tune from
the Admin Center `AI` tab in `102.4 KiB` steps, giving ten steps per MiB while
the database stores integer bytes. `/api/mcp` still enforces an absolute
`5 MiB` cap before database or authentication work, then applies the cached
configured limit before bearer-token verification or service creation.

## Control Mapping

<!-- markdownlint-disable MD013 -->

| AISVS area | Target | Status | Evidence | Gap / follow-up |
| --- | --- | --- | --- | --- |
| C2 input validation: bounded text and request shape | L1 | Implemented | Zod route schemas, image MIME/base64/size checks, `MAX_AI_*` limits | None |
| C2 prompt-injection detection | L1 | Implemented first pass | `lib/ai/safety.ts`, DB-backed `ai_safety_rule_terms`, route tests for input block before provider use | Broader evasion coverage: #386 |
| C2 prompt injection via encoding and obfuscation | L1/L2 | Partial | DB-backed coding and representation terms tied to prompt-injection targets | Stronger canonicalization and classifier evaluation: #386 |
| C2 image hidden-content detection | L2 | Deferred | Image type/base64/size are validated; hidden text is not inspected | Hidden image content screening: #387 |
| C5 access control around AI and MCP | L1 | Implemented | `secureMutationRoute`, requirements authorization policies, MCP bearer-token verification | None |
| C7 output schema validation | L1 | Implemented | Structured OpenRouter response format and `requirementsImportPayloadSchema` validation | None |
| C7 unsafe output filtering | L1/L2 | Implemented first pass | `screenAiOutput`, DB-backed output terms, route tests proving unsafe output is not echoed | Broader harmful-content classifier evaluation: #386 |
| C7 system-adjacent content leakage detection | L2 | Implemented first pass | Output terms for bearer headers, OpenRouter key shape, HSA claim names, and prompt markers | Expand if future evidence shows leakage patterns |
| C9 orchestration budgets and timeouts | L1 | Implemented | OpenRouter request/model timeouts, AI throttle, capacity metrics, MCP schema tests | None |
| C9 human approval before persistence | L1 | Implemented | AI output only enters import preview; no requirement is persisted until the user confirms import/create | None |
| C9 kill switch | L1/L2 | Implemented | Admin AI setting plus `AI_REQUIREMENT_GENERATION_DISABLED` environment override; AI safety DB read failures fail closed | None |
| C10 MCP token validation | L1 | Implemented | JWT signature, issuer, audience, expiry, HSA-id, and role parsing tests | None |
| C10 MCP token non-persistence | L1 | Implemented | Bearer token is verified per request and not stored in app state or logs | None |
| C10 strict MCP tool schemas | L1 | Implemented | Zod schemas and MCP unit/property tests | None |
| C10 MCP payload limit | L2 | Implemented | `mcpMaxRequestBytes`, absolute `5 MiB` cap, JSON-RPC `413` tests | None |
| C10 MCP per-invocation authorization | L2 | Implemented | Tool calls pass verified `RequestContext` into requirements service authorization | None |
| C10 MCP Host/Origin validation | L2 | Deferred | Bearer auth is enforced; Host/Origin topology rules are not yet explicit | Deployment topology and validation decision: #388 |
| C10 MCP tool-discovery filtering | L2 | Deferred | Tool allowlist is static and authenticated; discovery is not actor/scope-filtered | Discovery filtering decision: #389 |
| C12 AI interaction metadata logging | L1 | Implemented | Capacity events record operation metrics without prompts or content | None |
| C12 AI safety decision logging | L2 | Implemented | `ai.input_safety.blocked`, `ai.output_safety.blocked`, `ai.safety_filter.failed` security events | None |
| C12 prompt-injection alerting | L1 | Partial | Security audit events can be selected by the platform log pipeline | Alert routing/SIEM policy: #390 |

<!-- markdownlint-enable MD013 -->

## Follow-Up Issue Policy

Create a GitHub issue when a control is applicable and missing, or when the
remaining work is concrete enough to verify. Do not create issues for controls
that are not applicable to the current product.

Each follow-up issue should include:

- The related AISVS control area.
- Current evidence.
- The specific gap.
- Acceptance criteria.
- A link back to issue `#348` and this mapping.

Use `ready-for-agent` only when the issue is small enough for an agent to
implement without another design pass.
