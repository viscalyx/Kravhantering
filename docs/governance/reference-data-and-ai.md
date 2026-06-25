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

Sources: `lib/ai/openrouter-client.ts`,
`lib/ai/openrouter-model-catalog.ts`, `lib/ai/requirement-prompt.ts`,
`lib/ai/taxonomy.ts`

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
requirements-library action remains visible but disabled, an already-open
generator dialog disables its Generate button, REST generation returns the
sanitized provider-unavailable SSE error, and the MCP generation tool returns
the existing `service_unavailable` error before taxonomy, model-catalog, or
chat-completion work starts.

### OpenRouter Client Contracts

**Timeout guarantees:**

| Operation | Timeout | Constant |
| --------- | ------- | -------- |
| Chat completion | 120 s | `DEFAULT_TIMEOUT_MS` |
| Streaming chat | 120 s | `STREAM_TIMEOUT_MS` |
| Model list | 10 s | `AbortSignal.timeout()` |
| Key info | 5 s | `AbortSignal.timeout()` |

**Signal handling:** the caller's `AbortSignal` and the
internal timeout are wired so that whichever fires first
cancels the fetch.

**Error format:**
`"OpenRouter request failed (${status}): ${body}"`

**Default model:**
`process.env.NEXT_PUBLIC_DEFAULT_MODEL` or
`'anthropic/claude-sonnet-4'`.

**Reasoning effort:** `'high'` by default; `'none'` disables
reasoning tokens.

**Format negotiation:** generation resolves the selected or default model's
capabilities server-side from the eligible OpenRouter model catalog. When the
resolved model supports `structured_outputs`, the request uses `json_schema`;
otherwise it uses `json_object`. If the model catalog cannot be resolved, or
the selected model is outside the eligible catalog, generation fails closed
with the sanitized AI-provider-unavailable response.

### Prompt Contracts

**Locale-dependent:** full system and user prompts exist in
both English and Swedish. The prompt language matches the
active locale.

`messages/sv.json` intentionally has one extra
`ai.prompt.system.outputRules` item requiring generated
descriptions, acceptance criteria, verification methods and
rationales to be written in Swedish. Keep this locale-specific
rule when comparing `outputRules` with `messages/en.json`;
alignment should preserve deliberate language constraints.

**Taxonomy binding:** the system prompt includes all taxonomy
IDs with their locale-appropriate names so the model can
reference valid IDs in its output.

**ISO standards referenced:** 29148:2018, 25030:2019,
25010:2023.

### Validation and Repair

`validateGeneratedRequirements()` in
`lib/ai/requirement-prompt.ts` applies these rules:

- **Invalid `typeId`** → requirement filtered out (deleted
  from results).
- **Invalid `categoryId`** → set to `undefined` (repaired).
- **Invalid `qualityCharacteristicId`** → set to `undefined`
  (repaired).
- **Invalid `priorityLevelId`** → set to `undefined` (repaired).
- **Invalid `requirementPackageIds` entries** → filtered from array.

`typeId` is the only hard requirement because every
requirement must have a type.

### Taxonomy Loading

`loadTaxonomy()` in `lib/ai/taxonomy.ts`:

- Runs 5 DAL queries in parallel via `Promise.all`:
  categories, types, quality characteristics, priority levels,
  requirement packages.
- Selects localized `nameEn` or `nameSv` for taxonomy tables based on the
  `locale` parameter. Requirement packages are authored as one-language content
  and use their stored `name` for both locales.
- Quality characteristics include parent hierarchy: a `Map`
  by `id` resolves `parentName` from `parentId`.
- Priority levels include `id`, `code`, localized `name`, localized
  `description`, and localized `assessmentCriteria`.
- Other results are mapped to `{ id, name }` (plus `parentName` for quality
  characteristics).

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
and the same `requirementPackageIds` field. `requirementPackageIds` is used for
library imports and ignored for specification-local imports. The prompt artifact
intentionally has no frontmatter and no examples. Its `types` reference data
nests the selectable child `qualityCharacteristics` allowed for that type, such
as functional `3.1.x` values under the functional type. Top-level grouping rows
such as `3.1` are omitted. Taxonomy rows in the prompt are localized to the
requested artifact language and expose a single `name` field instead of both
`nameEn` and `nameSv`.
The prompt includes concise field-selection rules for functional versus
non-functional type choice, type-scoped quality characteristics, norm-reference
links, priority and verification fields. It tells the AI to prefer ID fields
from the reference data; the schema still accepts name and code fallback fields
so human-authored import files can be resolved when the values uniquely match
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
