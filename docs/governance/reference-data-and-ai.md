# Norm Library, Reference Data, and AI-Assisted Authoring

<!-- cSpell:ignore FEFF -->

Behavioral contracts for the norm library, reference data DALs, and AI
requirement generation. These contracts are auditable by the spec-audit skill
(scrutiny areas 13–14).

## 1 — Norm Library

Source: `lib/dal/norm-references.ts`

### ID Derivation

When `normReferenceId` is not provided (or empty after trim),
`createNormReference()` auto-derives it using a 3-tier strategy:

1. **Extract from reference field** — regex matches patterns
   like `SFS 2018:218` → `SFS-2018-218`.
2. **Slug from name** — uppercase, NFD-stripped diacritics,
   max 20 characters, spaces/hyphens collapsed.
3. **Sequential fallback** — `NR-001`, `NR-002`, etc.

### Collision Resolution

If the derived ID already exists in the database, the resolver
appends `-2`, `-3`, … up to `-999`. If all 998 suffixes are
taken, it falls back to `-${Date.now()}`.

### Listing and Lifecycle

`listNormReferences()` returns active norm references by default. Pass
`includeArchived` for the Norm library stewardship surface, or `includeIds`
when a requirement form must show already selected archived references without
offering every archived reference as a new choice.

Archiving a norm reference hides it from new requirement links but keeps
existing links visible. Reactivation makes it selectable again.

### Linked Requirements

`countLinkedRequirements()` counts distinct requirements per
norm reference, with an optional `statuses` filter array.
`getLinkedRequirements()` returns linked requirements with both `statusNameSv`
and `statusNameEn` columns.

### Ordering

`listNormReferences()` orders by `normReferenceId` ascending.
Active rows sort before archived rows when archived rows are included.
`getLinkedRequirements()` orders by `requirements.uniqueId` ascending.

### Localization

Norm references are **not localized**. External legal documents
keep their source-language names. The schema uses plain `name`,
`type`, `reference`, `issuer` columns without `_sv`/`_en`
suffixes.

### Input Validation

API routes validate norm-reference payloads before calling the DAL:
unknown fields are rejected, DB-backed strings are capped, linked-status
query arrays are bounded, and route IDs must be positive integers.
When `normReferenceId` is provided and non-empty after trim, the DAL
still uses it as-is; uniqueness remains enforced by the DB unique index.

## 2 — Requirement Area Ownership

Requirement-area ownership is stored on the requirement area row as
`owner_hsa_id`. The app displays that HSA-id wherever the owner is shown.
Creation requires a valid HSA-id. Editing shows the current HSA-id as
read-only and uses a dedicated owner-change action for replacement.

There is no `/owners` admin surface or owners REST resource, and no local
person catalog lookup is performed in this flow.

## 3 — Specification Lookups

Sources: `lib/dal/specification-implementation-types.ts`,
`lib/dal/specification-lifecycle-statuses.ts`,
`lib/dal/specification-governance-object-types.ts`

### Shared Pattern

All three DALs follow the same structure:

- Bilingual columns: `nameSv` and `nameEn`.
- List ordering: `ORDER BY nameSv` ascending.
- CRUD operations: `list`, `create`, `update`, `delete`.
- All linked from `requirements_specifications` via foreign keys.

### Validation

<!-- markdownlint-disable MD013 -->

| Layer | Create validation | Update validation |
| --- | --- | --- |
| API routes | Strict object schemas, unknown-field rejection, bounded bilingual names, and positive integer IDs | Strict object schemas, unknown-field rejection, bounded optional fields, and positive integer IDs |
| `specification-lifecycle-statuses.ts` | Trims both `nameSv`/`nameEn`; throws if either is empty | Trims each provided field; throws if empty |
| `specification-implementation-types.ts` | None | None |
| `specification-governance-object-types.ts` | None | None |

<!-- markdownlint-enable MD013 -->

The API layer now provides the common request-shape guardrails for all
three lookup groups. The remaining DAL variance is intentional:
specification lifecycle statuses belong to statuses and workflows because
they determine specification workflow gates, while implementation types and
governance object types are informational taxonomy values.

### Delete Return Values

- `specification-lifecycle-statuses`: returns row count (number).
- `specification-implementation-types`: returns `void`.
- `specification-governance-object-types`: returns `void`.

## 4 — AI Requirement Generation

Sources: `app/api/ai/generate-requirement-import/route.ts`,
`app/api/ai/repair-requirement-import-json/route.ts`,
`lib/ai/openrouter-client.ts`, `lib/ai/openrouter-model-catalog.ts`,
`lib/ai/requirement-prompt.ts`, and requirement import schema/prompt sources
listed in section 5.

Local OpenRouter setup and live-provider smoke guidance live in
[ai-assisted-authoring-developer-workflow.md](../development/ai-assisted-authoring-developer-workflow.md).

### Availability Controls

AI-assisted requirement generation is available only when both controls allow
it:

- Admin Center `AI` has `Requirement generation` enabled.
- `AI_REQUIREMENT_GENERATION_DISABLED` is not set to `1` or a
  case-insensitive `true` value (`true`, `True`, or `TRUE`).

The environment guard has higher precedence and is intended for security scans
and deployment freeze windows. When either control disables generation, the
requirements-library and kravunderlag actions remain visible but disabled, an
already-open generator dialog disables its Generate button, and REST generation
returns the sanitized provider-unavailable SSE error before model-catalog or
chat-completion work starts.

### OpenRouter Client Contracts

**Timeout guarantees:**

<!-- markdownlint-disable MD013 -->

| Operation | Timeout | Contract |
| --------- | ------- | -------- |
| Chat completion | 120 s | absolute request timeout (`DEFAULT_TIMEOUT_MS`) |
| Streaming chat | 120 s | idle timeout; long active streams may continue while the provider sends chunks |
| Model list | 10 s | `AbortSignal.timeout()` |
| Key info | 5 s | `AbortSignal.timeout()` |

<!-- markdownlint-enable MD013 -->

**Signal handling:** the caller's `AbortSignal` and the
internal timeout are wired so that whichever fires first
cancels the fetch.

**Error format:**
`"OpenRouter request failed (${status}): ${body}"`

**Default model:**
`process.env.NEXT_PUBLIC_DEFAULT_MODEL` or
`'anthropic/claude-sonnet-4'`. In the UI, saved favorite models take
precedence: the cheapest available favorite is preselected before the
deployment default and the first available model.

**Reasoning effort:** `'high'` by default; `'none'` disables
reasoning tokens.

**Format negotiation:** generation resolves the selected or default model's
capabilities server-side from the eligible OpenRouter model catalog. When the
resolved model supports `structured_outputs`, the request uses `json_schema`;
otherwise it uses `json_object`. If the model catalog cannot be resolved, or
the selected model is outside the eligible catalog, generation fails closed
with the sanitized AI-provider-unavailable response.

### Prompt Contracts

**Locale-dependent:** the AI generation instruction exists in both English and
Swedish. The prompt language matches the active locale.

AI-assisted authoring does not maintain a separate generated-requirement output
schema. It reuses the kravimport instruction and JSON Schema from section 5.
The app-owned AI instruction adds generation-specific guidance, while the
import instruction and schema remain mandatory and cannot be overridden by the
user's need/context prompt.

The AI request is split into a system message, a user message, and a structured
response format. The system message contains the AI role, the non-override rule,
and the runtime-built kravimport instruction. The user message contains the
app-owned AI instruction, `Behov och sammanhang` / `Need and context`, and the
requested candidate count. The JSON Schema is not inserted into the system
message text; it is sent as the mandatory structured response format. The
AI-assisted authoring UI exposes `Så byggs AI-anropet` / `How the AI request is
built` as a separate explanation dialog. The dialog shows the request as
application rules, the user's order, and the mandatory response format, with
exact system/user/import text available as secondary details. It does not show
or download the full schema; schema inspection and schema download belong to the
import views.

The user-facing prompt field is `Behov och sammanhang` / `Need and context`.
There is no second free-text instruction field; later steering should be added
as concrete controls when needed.

### AI Safety Controls

AISVS evidence for AI-assisted authoring is tracked in
[AISVS AI and MCP Control Mapping](../security-privacy/aisvs-ai-mcp-control-mapping.md).

Generation and repair use the local deterministic safety screen in
`lib/ai/safety.ts`. The rule patterns are code-owned, while rule terms are
required seed data stored in `ai_safety_rules` and `ai_safety_rule_terms` and
administered from the Admin Center `AI and MCP security` section. There is no
runtime fallback list in code; if the active rule set cannot be read from the
database, AI-assisted authoring fails closed before provider work. Input
screening runs after AI availability is confirmed and before model-catalog or
chat-completion work. The screen evaluates the user's need/context, repair
`rawJson`, repair validation `errors`, and image MIME metadata. It blocks
obvious instruction override, attempts to extract non-public prompt/backend
material, encoded smuggling tied to override terms, secret extraction, and
harmful-generation requests. Requests to inspect the AI request text that the
app intentionally exposes in `Så byggs AI-anropet` / `How the AI request is
built` are not safety blocks by themselves. This keeps the filter aligned with
the transparency model: it prevents control override and non-public instruction
extraction without treating the supported explanation UI as secret.

The active rule set is cached in process memory for the Admin-configured
`aiSafetyRuleCacheTtlSeconds`. Admin mutations clear the local cache
immediately; other instances observe changes when their TTL expires.

Streaming generation buffers raw model chunks server-side. The route emits the
final `done`, `validation_error`, or safe `error` event only after output
safety screening and schema validation. Unsafe model output is never returned
as `rawContent`, `thinking`, or validation-error payloads. The repair route
uses the same output screen before validating or returning repaired JSON.

Safety decisions are written to the JSON `security-audit` log stream with
metadata only. The event names are `ai.input_safety.blocked`,
`ai.output_safety.blocked`, and `ai.safety_filter.failed`. Details include
operation, decision, rule IDs, categories, source, request/correlation IDs,
and model/provider when available. They do not include prompts, raw model
output, repair JSON, image data, or actor HSA-id values.

**Reference-data binding:** the import instruction includes current taxonomy
and norm-reference data so the model can emit import JSON with stable IDs where
possible. The model may propose missing norm references through
`proposedNormReferences`; those proposals are previewed separately and only
move forward when selected by the user.

**ISO standards referenced:** 29148:2018, 25030:2019, 25010:2023.

### Validation and Repair

Generated output is parsed as JSON and validated with
`requirementsImportPayloadSchema`. Valid output is previewed through the same
editable import review surface as uploaded import files. Invalid output is
reported as schema issues, logged without raw prompt/content, and can be sent
to the repair route together with a generated repair prompt and selected model.

## 5 — Requirement Import Schema and AI Reference Prompt

Sources: `lib/requirements/import-schema.ts`,
`lib/requirements/import-service.ts`, `app/api/requirements/import/schema`,
`app/api/requirements/import/ai-prompt`.

Requirement import publishes a strict shared JSON Schema whose top-level
`schemaVersion` is `requirement-import.v1`. The version applies to the whole
import file, including requirement candidates and support data such as
`proposedNormReferences`. The same file format is used for kravbiblioteksimport
and kravunderlagsimport; destination context is selected in the UI/API outside
the file. Unknown fields are rejected, including destination fields such as
`areaId`, `specificationId` and `needsReferenceId`.
In the schema artifact this is represented as `properties.schemaVersion`,
because JSON Schema describes top-level object fields under `properties`; the
actual import JSON still places `schemaVersion` at the root.

The authenticated schema endpoint returns only the raw schema. The authenticated
AI prompt endpoint returns Markdown containing the schema plus current taxonomy
and norm references so an AI system can produce valid JSON without guessing
reference data. The schema and prompt are shared for library imports and
specification-local imports; they include requirement-package reference data
and the same `requirementPackageIds` field. `requirementPackageIds` and
`requirementPackageNames` are used for library imports and ignored for
specification-local imports. Specification-local preview surfaces that as a
row-level information message, not a warning. The prompt artifact intentionally
has no frontmatter and no examples. Its `types` reference data nests the
selectable child `qualityCharacteristics` allowed for that type, such as
functional `3.1.x` values under the functional type. Top-level grouping rows
such as `3.1` are omitted. Taxonomy rows in the prompt are localized to the
requested artifact language and expose a single `name` field instead of both
`nameEn` and `nameSv`.
The prompt includes concise field-selection rules for functional versus
non-functional type choice, type-scoped quality characteristics, norm-reference
links, priority, requirement packages and verification fields. It tells the AI
to prefer ID fields from the reference data. Free-text values such as
`description`, `acceptanceCriteria`, `verificationMethod` and proposed norm
references use the requested application locale by default: Swedish for `sv`
artifacts and English for `en` artifacts, unless the user's own input
explicitly requests another language. JSON Schema still controls field names
and data shape. It also includes a conflict rule: user input controls factual
need, scope, requirement content and factual values; JSON Schema controls
allowed fields, data types, required fields and result format; reference data
controls requirement structure, classification, IDs and labels.
For requirement packages, the AI instruction tells the model to compare the
requirement need, requirement text and acceptance criteria with
`requirementPackages[].purposeAndScope` and only choose packages where the
requirement clearly belongs within the package purpose and scope. The schema
still accepts name and code fallback fields so
human-authored import files can be resolved when the values uniquely match
active reference data.

Preview resolves numeric IDs, priority codes and names against current
reference data. Names can match either Swedish or English reference-data names
but must match uniquely; otherwise the value is surfaced as a warning and
omitted if the user proceeds. Existing norm references are linked through
`normReferenceIds` values that match `normReferences[].normReferenceId`.
`proposedNormReferences` can describe missing sources but execute never creates
norm references automatically. During import review, a proposal referenced by
`proposedNormReferenceKeys` can be linked to an existing normreferens or opened
in the same normreferens form used by Normbiblioteket. When the user creates or
links the normreferens, the affected rows receive the resolved
`normReferenceIds` value before execute.

### Human-Facing Import Examples

These examples are documentation samples for users. They are intentionally not
included in the schema artifact or AI prompt/reference artifact. Both
kravbiblioteksimport and kravunderlagsimport use the same file format; the
target kravområde or current kravunderlag is selected in the UI/API outside the
JSON content.

Minimal valid import JSON:

```json
{
  "schemaVersion": "requirement-import.v1",
  "requirements": [
    {
      "description": "Systemet ska logga säkerhetsrelevanta händelser."
    }
  ]
}
```

Richer import JSON with optional metadata and proposed norm references:

```json
{
  "schemaVersion": "requirement-import.v1",
  "proposedNormReferences": [
    {
      "key": "gdpr-article-32",
      "name": "GDPR artikel 32",
      "type": "Förordning",
      "reference": "Artikel 32",
      "issuer": "Europeiska unionen",
      "normReferenceId": "GDPR-ART-32",
      "uri": "https://eur-lex.europa.eu/eli/reg/2016/679/oj"
    }
  ],
  "requirements": [
    {
      "description": "Systemet ska skydda personuppgifter mot obehörig åtkomst.",
      "acceptanceCriteria": "Åtkomst kräver autentisering och behörighet.",
      "categoryName": "Verksamhetskrav",
      "typeName": "Icke-funktionellt",
      "qualityCharacteristicName": "Interoperabilitet",
      "priorityLevelCode": "P4",
      "requirementPackageNames": ["Integration med andra system"],
      "normReferenceIds": ["SFS 2018:218"],
      "proposedNormReferenceKeys": ["gdpr-article-32"],
      "requiresTesting": true,
      "verificationMethod": "Verifieras med behörighetstest."
    },
    {
      "description": "Systemet ska kunna exportera kravlistor i CSV-format.",
      "categoryId": 1,
      "typeId": 1,
      "qualityCharacteristicId": 2,
      "requirementPackageIds": [3],
      "requiresTesting": false
    }
  ]
}
```

The examples show both name-based and numeric reference-data fields. Numeric IDs
are used when valid. Names are accepted only when they map uniquely to active
reference data, and `qualityCharacteristicId` or `qualityCharacteristicName`
must belong to the selected type. Optional unresolved metadata is shown as a
warning in the import review and is omitted if the user continues. Proposed
norm references include the fields needed by the normreferens form: `key`,
`name`, `type`, `reference`, `issuer`, optional `normReferenceId`, optional
`uri` and optional `version`.
