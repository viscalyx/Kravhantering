# Issue 395 Planning Decisions

<!-- markdownlint-disable MD013 -->

Temporary implementation note for issue 395. This file records the agreed
questions, decisions, and proposed wording so context compaction does not lose
the design.

## Scope

Issue 395 is still relevant. It is open and current code only partially
implements it:

- AI safety blocks already emit structured `security-audit` JSON metadata.
- Current user-facing errors are generic and do not name a rule type.
- Current metadata events do not explicitly include safety-rule direction,
  blocked step, reason, or forensic trigger evidence.
- Current logs intentionally omit raw prompts/model output, but issue 395 now
  explicitly requires a separate forensic raw-content event.

## Decisions

1. Existing console JSON contract
   - Decision: enrich the existing `security-audit` JSON metadata event instead
     of adding a second metadata stream.
   - Reasoning: the existing channel already has correlation IDs, SIEM-oriented
     shape, and redaction boundaries.

2. Multiple matched rule types in the user-facing error
   - Decision: show one primary localized rule type in the user-facing error.
   - Decision: keep the full matched list in logs.
   - Decision: choose the primary rule by deterministic safety-rule catalog
     priority, not alphabetical sorting.

3. Source for user-facing rule type names
   - Decision: use canonical standard names keyed by `ruleId`, not mutable Admin
     Center rule names.
   - Canonical Swedish names:
     - `instruction_override`: `Promptinjektion: instruktionsövertagande`
     - `system_prompt_extraction`: `Läckage av systemprompt`
     - `encoded_smuggling`: `Promptinjektion via kodning och maskering`
     - `secret_extraction_request`:
       `Känslig informationsutläsning: hemligheter`
     - `harmful_generation_request`: `Begäran om skadligt innehåll`
     - `sensitive_backend_leak`: `Läckage av systemnära innehåll`
   - Canonical English names:
     - `instruction_override`: `Prompt injection: instruction override`
     - `system_prompt_extraction`: `System prompt leakage`
     - `encoded_smuggling`:
       `Prompt injection via encoding and obfuscation`
     - `secret_extraction_request`:
       `Sensitive information disclosure: secrets`
     - `harmful_generation_request`: `Harmful content generation request`
     - `sensitive_backend_leak`: `System-adjacent content leakage`

4. Redacted/limited snippets in `security-audit`
   - Initial recommendation was no snippets.
   - User correction: the system must output raw blocked content, unredacted and
     unlimited, but not in the existing metadata-only event.

5. Raw blocked content event shape
   - Decision: add a separate forensic security event instead of expanding the
     existing `ai.*_safety.blocked` metadata event.
   - Proposed event names:
     - `ai.input_safety.blocked_content_captured`
     - `ai.output_safety.blocked_content_captured`
   - Decision: use the same correlation ID and request ID as the metadata event
     so streams can be joined.

6. Raw content capture default and control
   - Initial recommendation was deployment setting default off.
   - User correction: Admin Center setting, default enabled for now.
   - Future PR may disable by default.

7. Canonical wording for this work
   - Rejected wording: `AI safety rule tuning` / `trimma AI-säkerhetsregler`.
   - Decision: scope is diagnostic and security JSON log output for AI safety
     blocks.

8. Forensic log channel
   - Decision: raw blocked content must use a separate log channel.
   - Channel: `security-forensics`.
   - Metadata remains on `security-audit`.
   - Both events must include matching correlation fields.

9. Raw content event content boundary
   - Decision: log only the exact screened text part or parts for the blocking
     step, serialized with part labels.
   - Examples:
     - generation input: `need` plus image metadata
     - repair input: `rawJson` and `errors`
     - streamed reasoning: screened reasoning text
     - final output: `rawContent` and `thinking`
   - Do not include system prompts, import instructions, JSON schema, model
     request bodies, raw images, or unrelated prior state.

10. Trigger evidence
    - Decision: log trigger evidence in the `security-forensics` event only.
    - Evidence includes exact configured terms and matched text for:
      - `handling` / action
      - `mål` / target
      - `kodningsord` / coding word
      - `direktfras/markör` / direct phrase or marker
    - For paired rules, log matched `handling` and `mål`.
    - For encoded rules, log matched `kodningsord` and `mål`.
    - For direct-marker rules, log matched `direktfras/markör`.
    - Include configured term text and matched text when they differ by case or
      whitespace normalization.

11. Deployment setting name
    - Rejected: environment variable
      `AI_SAFETY_BLOCKED_CONTENT_LOGGING_ENABLED`.
    - Decision: Admin Center setting instead.

12. Admin AI tab section placement
    - Initial recommendation was to keep `MCP-gränssnitt` / `MCP interface`.
    - User correction: create a new AI security section because the setting
      controls every AI safety block source.
    - Decision: move `Cachetid för säkerhetsregler` and
      `AI-säkerhetsregler` into the new section with the forensic logging
      toggle.

13. ADR
    - Decision: create an ADR.
    - Reasoning: raw content logging is surprising, hard to reverse once log
      pipelines depend on it, and a real trade-off between diagnostics,
      forensics, privacy, and secret exposure.

14. Toggle behavioral scope
    - Clarification: the setting controls only AI safety forensic JSON output.
    - It does not enable/disable the AI safety filter.
    - It does not enable/disable metadata-only `security-audit` events.
    - It does not change blocking behavior or user-facing errors.

15. Source coverage for the toggle
    - Decision: apply the forensic-output toggle to every AI safety block
      source, including generation, repair, and future AI safety-screened routes.

16. Runtime settings cache
    - Decision: use a separate short-lived cached accessor:
      `getCachedAiSafetyRuntimeSettings`.
    - Do not stretch the MCP runtime settings cache.
    - Missing/legacy DB columns default to forensic logging enabled.

17. New Admin UI section name
    - Decision: `AI-säkerhet` in Swedish and `AI security` in English.
    - `CONTEXT.md` was updated with `AI-säkerhet` / `AI security`.
    - Keep individual concepts as `AI-säkerhetsregel` / `AI safety rule` and
      `AI-säkerhetsfilter` / `AI safety filter`.

18. Admin setting API/DB/code name
    - Decision: `aiSafetyForensicLoggingEnabled`.
    - DB column: `ai_safety_forensic_logging_enabled`.
    - Default: enabled (`1`).
    - UI label:
      - Swedish: `Logga forensisk AI-säkerhetsdata`
      - English: `Log forensic AI security data`

19. Multiple triggers per rule
    - Decision: log all trigger evidence found for each matched rule, grouped by
      `ruleId`, with the matched screened part label.
    - Reasoning: since raw content is intentionally logged, limiting trigger
      evidence weakens diagnostics without materially reducing exposure.

20. Safe decision shape vs forensic result
    - Decision: keep the ordinary `AiSafetyDecision` metadata-safe.
    - Add a richer internal screening result for routes that may emit forensic
      evidence.
    - Reasoning: future code should not accidentally pass trigger evidence into
      the metadata-only `security-audit` event.

21. Implementation authorization
    - Decision: proceed with implementation, including ADR, docs, tests, schema,
      UI, logging, and route updates.

## Proposed User-Facing Error Wording

English:

- Input: `The AI request was blocked by the AI safety filter: {ruleType}. Revise the need or context and try again.`
- Output: `The AI response was blocked by the AI safety filter: {ruleType}. Revise the request and try again.`

Swedish:

- Input: `AI-anropet blockerades av AI-säkerhetsfiltret: {ruleType}. Ändra behovet eller sammanhanget och försök igen.`
- Output: `AI-svaret blockerades av AI-säkerhetsfiltret: {ruleType}. Ändra anropet och försök igen.`

## Proposed Admin UI Wording

Section:

- Swedish title: `AI-säkerhet`
- Swedish description:
  `Styr AI-säkerhetsfilter, säkerhetsregelcache, forensisk loggning och AI-säkerhetsregler.`
- English title: `AI security`
- English description:
  `Control the AI safety filter, safety-rule cache, forensic logging, and AI safety rules.`

Toggle:

- Swedish label: `Logga forensisk AI-säkerhetsdata`
- Swedish help:
  `När inställningen är på skriver AI-säkerhetsblockeringar en separat forensisk JSON-händelse med rått blockerat innehåll och matchade regeltermer. Metadatahändelsen i säkerhetsloggen skrivs alltid.`
- English label: `Log forensic AI security data`
- English help:
  `When enabled, AI safety blocks write a separate forensic JSON event with raw blocked content and matched rule terms. The metadata event in the security audit log is always written.`

## Proposed JSON Event Shapes

Metadata event on `security-audit`:

```json
{
  "channel": "security-audit",
  "event": "ai.output_safety.blocked",
  "outcome": "failure",
  "detail": {
    "eventId": "<uuid>",
    "decision": "blocked",
    "operation": "ai.generate-requirement-import",
    "requestId": "<request-id>",
    "correlationId": "<correlation-id>",
    "ruleIds": ["sensitive_backend_leak"],
    "ruleTypes": ["System-adjacent content leakage"],
    "primaryRuleId": "sensitive_backend_leak",
    "primaryRuleType": "System-adjacent content leakage",
    "safetyRuleDirection": "output",
    "blockedStep": "final_model_output",
    "reason": "ai_safety_rule_match",
    "source": "rest",
    "textLengthBucket": "0-1k",
    "model": "anthropic/claude-sonnet-4",
    "provider": "anthropic"
  }
}
```

Forensic event on `security-forensics`:

```json
{
  "channel": "security-forensics",
  "event": "ai.output_safety.blocked_content_captured",
  "outcome": "failure",
  "eventId": "<same-uuid-as-metadata-event>",
  "operation": "ai.generate-requirement-import",
  "requestId": "<request-id>",
  "correlationId": "<correlation-id>",
  "safetyRuleDirection": "output",
  "blockedStep": "final_model_output",
  "ruleIds": ["sensitive_backend_leak"],
  "content": [
    { "label": "rawContent", "text": "{...}" },
    { "label": "thinking", "text": "Authorization: Bearer ..." }
  ],
  "evidence": [
    {
      "ruleId": "sensitive_backend_leak",
      "partLabel": "thinking",
      "terms": [
        {
          "termType": "direct_marker",
          "configuredTerm": "authorization: bearer",
          "matchedText": "Authorization: Bearer"
        }
      ]
    }
  ]
}
```

## Proposed ADR Wording

Title: `Forensisk loggning av blockerade AI-säkerhetsblockeringar`

Core decision:

`Kravhantering skriver fortsatt metadata om AI-säkerhetsblockeringar till
säkerhetsloggen. Därutöver kan Admin Center styra en separat forensisk
JSON-loggström som innehåller rått blockerat innehåll och matchade
AI-säkerhetsregeltermer. Inställningen är på som standard under den aktuella
diagnostikfasen, men är avsedd att kunna bli avstängd som standard i en senare
ändring. Den forensiska händelsen använder samma request-id, korrelations-id
och event-id som metadatahändelsen så att loggströmmar kan korreleras även när
de routas till olika loggmål.`

Trade-offs:

- Metadata-only logging protects privacy and secrets better but is too weak for
  diagnosing false positives and blocked AI responses.
- Raw forensic logging gives enough evidence to diagnose and tune blocking, but
  can contain secrets, personal data, model reasoning, and hostile text.
- A separate channel allows stricter routing and retention without weakening the
  metadata-only security audit contract.
