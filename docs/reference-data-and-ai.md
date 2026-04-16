# Reference Data and AI Generation

<!-- cSpell:ignore FEFF -->

Behavioral contracts for reference data DALs and AI requirement
generation. These contracts are auditable by the spec-audit skill
(scrutiny areas 13–14).

## 1 — Norm References

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

### Linked Requirements

`countLinkedRequirements()` counts distinct requirements per
norm reference, with an optional `statuses` filter array.
`getLinkedRequirements()` returns linked requirements with
both `statusNameSv` and `statusNameEn` columns.

### Ordering

`listNormReferences()` orders by `normReferenceId` ascending.
`getLinkedRequirements()` orders by `requirements.uniqueId`
ascending.

### Localization

Norm references are **not localized**. External legal documents
keep their source-language names. The schema uses plain `name`,
`type`, `reference`, `issuer` columns without `_sv`/`_en`
suffixes.

### Input Validation

No input validation beyond database constraints. When
`normReferenceId` is provided and non-empty after trim, it is
used as-is — uniqueness is enforced by the DB unique index.

## 2 — Owners

Source: `lib/dal/owners.ts`

### Shape

`Owner` interface: `{ id, firstName, lastName, email }`.

### CRUD Contracts

- `listOwners()` — orders by `lastName`, then `firstName`
  (both ascending).
- `getOwnerById()` — returns `null` if not found.
- `createOwner()` — returns the raw Drizzle row.
- `updateOwner()` — always sets `updatedAt` to the current
  ISO timestamp. Returns `null` if the ID does not match.
- `deleteOwner()` — returns `boolean` indicating whether a
  row was deleted.

### Owner Validation

No business validation beyond database schema constraints.

## 3 — Package Taxonomy Lookups

<!-- markdownlint-disable MD013 -->

Sources: `lib/dal/package-implementation-types.ts`,
`lib/dal/package-lifecycle-statuses.ts`,
`lib/dal/package-responsibility-areas.ts`

<!-- markdownlint-enable MD013 -->

### Shared Pattern

All three DALs follow the same structure:

- Bilingual columns: `nameSv` and `nameEn`.
- List ordering: `ORDER BY nameSv` ascending.
- CRUD operations: `list`, `create`, `update`, `delete`.
- All linked from `requirement_packages` via foreign keys.

### Validation Variance

<!-- markdownlint-disable MD013 -->

| DAL | Create validation | Update validation |
| --- | --- | --- |
| `package-lifecycle-statuses.ts` | Trims both `nameSv`/`nameEn`; throws if either is empty | Trims each provided field; throws if empty |
| `package-implementation-types.ts` | None | None |
| `package-responsibility-areas.ts` | None | None |

<!-- markdownlint-enable MD013 -->

This variance is intentional. Lifecycle statuses are
safety-critical (they determine package workflow gates), while
implementation types and responsibility areas are informational
taxonomy values.

### Delete Return Values

- `package-lifecycle-statuses`: returns row count (number).
- `package-implementation-types`: returns `void`.
- `package-responsibility-areas`: returns `void`.

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

### Prompt Contracts

**Locale-dependent:** full system and user prompts exist in
both English and Swedish. The prompt language matches the
active locale.

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
- **Invalid `scenarioIds` entries** → filtered from array.

`typeId` is the only hard requirement because every
requirement must have a type.

### Taxonomy Loading

`loadTaxonomy()` in `lib/ai/taxonomy.ts`:

- Runs 5 DAL queries in parallel via `Promise.all`:
  categories, types, quality characteristics, risk levels,
  scenarios.
- Selects `nameEn` or `nameSv` based on the `locale`
  parameter.
- Quality characteristics include parent hierarchy: a `Map`
  by `id` resolves `parentName` from `parentId`.
- All results are mapped to `{ id, name }` (plus
  `parentName` for quality characteristics).
