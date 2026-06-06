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

Requirement-area owners are no longer reference data. The requirement area row
stores `owner_hsa_id` directly and the app displays that HSA-ID wherever the
owner is shown. Creation requires a valid HSA-ID. Editing shows the current
HSA-ID as read-only and uses a dedicated owner-change action for replacement.

There is no `/owners` admin surface or owners REST resource, and no local
person catalog lookup is performed in this flow.

## 3 — Specification Taxonomy Lookups

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
three taxonomy groups. The remaining DAL variance is intentional:
specification lifecycle statuses are safety-critical because they determine
specification workflow gates, while implementation types and
governance object types are informational taxonomy values.

### Delete Return Values

- `specification-lifecycle-statuses`: returns row count (number).
- `specification-implementation-types`: returns `void`.
- `specification-governance-object-types`: returns `void`.

## 4 — AI Requirement Generation

Sources: `lib/ai/openrouter-client.ts`,
`lib/ai/requirement-prompt.ts`, `lib/ai/taxonomy.ts`

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

**Format negotiation:** when the model's
`supportedParameters` includes `structured_outputs`, the
request uses `json_schema` response format. Otherwise it
falls back to `json_object`.

### OpenRouter Test Policy

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
- **Invalid `riskLevelId`** → set to `undefined` (repaired).
- **Invalid `requirementPackageIds` entries** → filtered from array.

`typeId` is the only hard requirement because every
requirement must have a type.

### Taxonomy Loading

`loadTaxonomy()` in `lib/ai/taxonomy.ts`:

- Runs 5 DAL queries in parallel via `Promise.all`:
  categories, types, quality characteristics, risk levels,
  requirement packages.
- Selects localized `nameEn` or `nameSv` for taxonomy tables based on the
  `locale` parameter. Requirement packages are authored as one-language content
  and use their stored `name` for both locales.
- Quality characteristics include parent hierarchy: a `Map`
  by `id` resolves `parentName` from `parentId`.
- All results are mapped to `{ id, name }` (plus
  `parentName` for quality characteristics).
