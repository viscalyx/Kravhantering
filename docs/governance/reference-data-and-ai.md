# Norm Library, Reference Data, and AI-Assisted Authoring

For developers and reviewers changing reference-data, AI authoring, or import
flows. Use these contracts to preserve stable identifiers, human review, and
the privacy and safety boundaries around generated requirements.

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
taken, creation fails with a conflict whose reason is
`norm_reference_id_generation_exhausted`. Supply a different explicit ID or
change the source used to derive it before retrying.

### Listing and Lifecycle

`listNormReferences()` returns active norm references by default. Pass
`includeArchived` for the Norm library stewardship surface, or `includeIds`
when a requirement form must show already selected archived references without
offering every archived reference as a new choice.

Archiving a norm reference hides it from new requirement links but keeps
existing links visible. Reactivation makes it selectable again.

### Localization

Norm references are **not localized**. External legal documents
keep their source-language names.

### Input Validation

API routes validate norm-reference payloads before calling the DAL:
unknown fields are rejected, DB-backed strings are capped, linked-status
query arrays are bounded, and route IDs must be positive integers.
When `normReferenceId` is provided and non-empty after trim, creation uses the
trimmed value; uniqueness remains enforced by the DB unique index.

## 2 — Requirement Area Ownership

Requirement-area ownership is stored on the requirement area row as
`owner_hsa_id`. The stewardship list shows the owner's stored display name
with the HSA-id, falling back to the HSA-id when no name is available.
Creation and owner replacement require a valid HSA-id and matching person
verification evidence. Editing shows the current HSA-id as read-only and uses
a dedicated owner-change action for replacement.

Verified person details supply the display name; the HSA-id remains the
ownership identifier.

## 3 — Specification Lookups

Specification implementation types and governance object types are
informational taxonomy values. Specification lifecycle statuses belong to
statuses and workflows because they determine specification workflow gates.
Do not treat a lifecycle-status change as a purely cosmetic taxonomy edit.

All three lookup groups have Swedish and English names. Their API routes
reject unknown fields, enforce bounded names, and require positive integer
IDs. Keep validation at the API boundary; internal DAL functions do not
uniformly validate names.

## 4 — AI Requirement Generation

Each AI request runs through an administrator-controlled AI connection. The AI
integration layer resolves the run profile and verified AI connection model
revision before a provider-specific adapter runs.
[ADR 0056](../adr/0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md)
defines unified model verification and stable run profiles. See
[ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md)
for the contract and
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md)
for the trust, lifecycle, and provider-secret boundaries.
[ADR 0054](../adr/0054-global-ai-sparr-och-driftsattningsbevis.md) defines the
release guard and deployment evidence, while
[ADR 0055](../adr/0055-innehallsfri-ai-observerbarhet-och-syntetisk-liveverifiering.md)
defines content-free AI observability and synthetic live verification.

Sources: `app/api/ai/generate-requirement-import/route.ts`,
`app/api/ai/repair-requirement-import-json/route.ts`,
`lib/ai/authoring-runtime.ts`, `lib/ai/integration-layer.ts`,
`lib/ai/requirement-prompt.ts`, and the requirement import schema/prompt
sources listed in section 5.

Local integration setup and live-adapter smoke guidance live in
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
returns the sanitized provider-unavailable SSE error before adapter egress
starts.

### Authoring Integration Contracts

The browser loads fixed availability descriptions for generation without
images, generation with images, and invalid-JSON repair. Each description is
resolved from the active administrator-managed run profile. It exposes only
the connection's public name and data-policy summary. Model identity, adapter
type, credentials, capability policy, provider preferences, reasoning settings,
pricing, and credits are not browser choices or authoring request fields.

Attaching an image selects the image-generation run type; it never selects a
connection or model. A missing, suspended, or blocked profile disables only
that action and gives the user a safe localized reason. Other application
features and other authoring actions remain available.

The route builds the import instruction, user prompt, response schema,
destination, authorization request, and safety inputs. `AIIntegrationLayer`
then resolves the exact active profile and verified model revision, coordinates
the run budget and queue, applies the trust boundary, and invokes the exact
registered adapter. Adapter deltas remain internal. The browser receives a
terminal sanitized error, a fully screened and schema-valid result, or
safety-screened invalid output with validation issues for the repair flow.

### Prompt Contracts

**Locale-dependent:** the AI generation instruction exists in both English and
Swedish. The prompt language matches the active locale.

AI-assisted authoring does not maintain a separate generated-requirement output
schema. It reuses the kravimport instruction and JSON Schema from section 5.
The app-owned AI instruction adds generation-specific guidance, while the
import instruction and schema remain mandatory and cannot be overridden by the
user's need/context prompt.

The AI request is split into a system message, a user message, and a mandatory
response contract. The system message contains the AI role, the non-override
rule, and the runtime-built kravimport instruction. The user message contains
the app-owned AI instruction, `Behov och sammanhang` / `Need and context`, and
the requested candidate count. When the verified model revision supports JSON
Schema steering, the adapter sends a provider-compatible strict schema through
the provider's native response format. Otherwise, the integration layer adds
the canonical schema to the system instruction. A `validatableJson` result does
not by itself activate a provider-specific response-format parameter. Completed
output is always validated against the canonical kravimport schema, never
against the stricter provider steering schema.

The AI-assisted authoring UI exposes `Så byggs AI-anropet` / `How the AI request
is built` as a separate explanation dialog. The dialog shows the request as
application rules, the user's order, and the mandatory response contract, with
exact system/user/import text available as secondary details. It does not show
or download the full schema; schema inspection and schema download belong to
the import views.

The user-facing prompt field is `Behov och sammanhang` / `Need and context`.
There is no second free-text instruction field; later steering should be added
as concrete controls when needed.

### AI Safety Controls

Generation and repair use the local deterministic safety screen in
`lib/ai/safety.ts`. The rule patterns are code-owned, while rule terms are
required seed data stored in `ai_safety_rules` and `ai_safety_rule_terms` and
administered from the Admin Center `AI security` section. There is no
runtime fallback list in code; if the active rule set cannot be read from the
database, AI-assisted authoring fails closed before provider work. Input
screening runs after AI availability is confirmed and before adapter egress.
The screen evaluates the user's need/context, repair `rawJson`, and repair
validation `errors`. The trust boundary also screens the assembled instructions
and text content, validates each image's type, signature and decoded
dimensions, then re-encodes accepted images without source metadata. The safety
screen blocks obvious instruction override, attempts to extract non-public
prompt/backend
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
operation, decision, blocked step, direction, reason, primary rule id/type,
all rule IDs/types, categories, source, request/correlation IDs, and
model/provider when available. The metadata event does not include prompts, raw
model output, repair JSON, image data, matched terms, or actor HSA-id values.

Raw forensic capture is never a persistent setting and never writes a separate
stdout channel. An Admin may request one operation-and-direction capture window
with an explicit 5–60-minute expiry. A different Privacy Officer must approve
it before capture begins. During that window, only the blocked step's content
parts are secret/direct-identifier redacted, byte- and item-bounded, and stored
in the isolated SQL evidence table. SQL Server time stops capture at expiry;
evidence becomes eligible for scheduled cleanup 72 hours after stop or expiry.

If the control or evidence-store query fails, the AI request remains blocked,
the metadata-only security event remains authoritative, and ordinary logs
receive only a static error classification. Blocked prompts, model output,
reasoning, repair payloads, matched evidence, secrets, and personal data are
never written to ordinary logs.

**Reference-data binding:** the import instruction includes current taxonomy
and norm-reference data so the model can emit import JSON with stable IDs where
possible. The model may propose missing norm references through
`proposedNormReferences`; those proposals are previewed separately and only
move forward when selected by the user.

### Validation and Repair

Generated output is parsed as JSON and validated with
`requirementsImportPayloadSchema`. Valid output is previewed through the same
editable import review surface as uploaded import files. Invalid output is
reported as schema issues, logged without raw prompt/content, and can be sent
to the repair route together with a generated repair prompt.

## 5 — Requirement Import Schema and Import Instruction

Sources: `lib/requirements/import-schema.ts`,
`lib/requirements/import-service.ts`, `app/api/requirements/import/schema`,
`app/api/requirements/import/instruction`.

Requirement import publishes a strict shared JSON Schema whose top-level
`schemaVersion` is `requirement-import.v4`. The version applies to the whole
import file, including requirement candidates and support data such as
`proposedNormReferences` and `proposedNeedsReferences`. Automated producers
must emit v4. The same file format is used for kravbiblioteksimport and
kravunderlagsimport;
destination context is selected in the UI/API outside the file. Unknown fields
are rejected, including destination fields such as `areaId` and
`specificationId`.

The authenticated schema endpoint returns the schema with the current global
row, proposal, nested-item, and JSON-depth limits. The fixed request transport
ceiling is 10 MiB and import content is limited to 8 MiB of UTF-8 data. The
authenticated import instruction endpoint returns Markdown containing field
selection rules and current taxonomy and norm references. Supply the separate
JSON Schema alongside this instruction so an AI system has both the required
data shape and current reference values. When the caller passes a
kravunderlag destination, the instruction also includes that kravunderlag's
existing `needsReferences` as `{id,text,description}` reference data. The schema
and import instruction are shared for library imports and specification-local
imports; they include requirement-package reference data and the same
`requirementPackageIds` field.
`requirementPackageIds` and
`requirementPackageNames` are used for library imports and ignored for
specification-local imports. Specification-local preview surfaces that as a
row-level information message, not a warning. The import instruction artifact
intentionally has no frontmatter and no examples. Its `types` reference data
nests the selectable child `qualityCharacteristics` allowed for that type,
such as functional `3.1.x` values under the functional type. Top-level
grouping rows such as `3.1` are omitted. Taxonomy rows in the import
instruction are localized to the requested artifact language and expose a
single `name` field instead of both `nameEn` and `nameSv`.

Requirement-package reference data crossing an AI-assistance boundary contains
only stable ID, package name, and purpose and scope. It excludes package-lead
display names, HSA IDs, email addresses, and other structured person
identifiers. This minimization applies equally to built-in authoring, REST, and
MCP consumers of the shared instruction. It does not alter ordinary package
administration views or remove identities deliberately written by a user in
free text.

The import instruction includes concise field-selection rules for functional
versus non-functional type choice, type-scoped quality characteristics,
norm-reference links, priority, requirement packages and verification fields.
It tells the AI to prefer ID fields from the reference data. For
specification-local imports, `needsReferenceId` may be selected only from
`needsReferences[].id` when the need clearly matches an existing
behovsreferens; loose word similarity is not enough. For specification-local
imports, the instruction asks AI systems to propose a small number of
`proposedNeedsReferences` only when the user's input gives clear goals, risks,
capabilities, sources, cases or scenarios that explain why one or more
requirements are needed in the kravunderlag. `proposedNeedsReferences[].text`
is a short reusable need heading, while `description` explains the connection
to the business need, scenario, risk or source. The instruction tells the AI to
group rows under shared needs references instead of creating one needs
reference per requirement row, and to leave row needs-reference fields empty
when the connection would be a guess. If both `needsReferenceId` and
`needsReferenceKey` are present on one row, `needsReferenceId` wins.

The instruction permits AI systems to synthesize needs references only from
factual support in the user's input. It forbids inventing business goals,
external sources, customer names or case numbers, and tells the AI to avoid
names or other details that identify a living person. Case numbers may be used
only when the user input explicitly provides them and they do not identify a
person. For kravbiblioteksimport, needs-reference fields are ignored with
information messages and the destination-aware instruction tells AI systems to
leave `needsReferenceId` and `needsReferenceKey` unset and return
`proposedNeedsReferences` as an empty list. Import instructions are always
destination-specific by import kind. Callers can request the
kravbiblioteksimport instruction without a requirement area because it does not
vary by area; kravunderlagsimport instructions require the specific
requirements specification because needs-reference reference data is scoped to
that specification.

Free-text values such as `description`, `acceptanceCriteria`,
`verificationMethod`, proposed norm references and proposed needs references
use the requested application locale by default: Swedish for `sv` artifacts and
English for `en` artifacts, unless the user's own input explicitly requests
another language. JSON Schema still controls field names and data shape. It
also includes a conflict rule: user input controls factual need, scope,
requirement content and factual values; JSON Schema controls allowed fields,
data types, required fields and result format; reference data controls
requirement structure, classification, IDs and labels.
For requirement packages, the import instruction tells the model to compare
the requirement need, requirement text and acceptance criteria with
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
For kravunderlagsimport, `needsReferenceId` is validated against the selected
kravunderlag. A row with `needsReferenceKey` must match
`proposedNeedsReferences[].key`; unresolved matches are blocking row errors
until the user links the proposal to an existing behovsreferens or creates a new
one in the import review. Execute receives only concrete `needsReferenceId`
values. In UI import this is a human review step. In MCP import there is no
human import-review step between validation and execute, so agents must ask the
user before creating missing behovsreferenser with
`requirements_manage_needs_reference`. If the user does not approve creation,
the agent must ask whether importing without the needs-reference link is
acceptable, and stop when the missing link is central to why the row belongs in
the kravunderlag.

### Human-Facing Import Examples

This minimal example is a documentation sample. It is not included in the
schema artifact or import instruction artifact. Both
kravbiblioteksimport and kravunderlagsimport use the same file format; the
target kravområde or current kravunderlag is selected in the UI/API outside the
JSON content.

Minimal valid import JSON:

```json
{
  "schemaVersion": "requirement-import.v4",
  "requirements": [
    {
      "description": "Systemet ska logga säkerhetsrelevanta händelser."
    }
  ]
}
```

For optional fields and reference-data values, fetch the authenticated schema
and destination-specific import instruction described above. Numeric IDs and
names depend on the current installation; copying them from a static example
can select the wrong classification or produce unresolved metadata.
