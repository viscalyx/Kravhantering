# MCP Server Contributor Guide

## Purpose

This guide explains how the in-project MCP server is structured, how it maps to
the shared requirements service, and how to extend it without fragmenting the
tool surface.

For end-user setup and client examples, see
[mcp-server-user-guide.md](./mcp-server-user-guide.md).

For admin-managed default column settings, see
[admin-center.md](../governance/admin-center.md).

## Server Contract

- Server name: `requirement-management-mcp-server`
- Endpoint: `/api/mcp`
- Runtime: Next.js server route in this self-hosted application
- Transport: stateless Streamable HTTP
- Primary public identifier: `uniqueId`
- Read response formats: `markdown`, `json`
- Supported locales: `en`, `sv`
- Exposed MCP tools: 17
- Exposed MCP resources:
  - `requirements://requirement/{uniqueId}`
  - `ui://requirements/requirement-detail/{uniqueId}`

## File Map

- `app/api/mcp/route.ts`
  Server entrypoint that builds the DB handle via
  `getRequestSqlServerDataSource()` and forwards the request into the MCP
  transport handler.
- `lib/mcp/http.ts`
  Creates a fresh `WebStandardStreamableHTTPServerTransport` for each request
  and connects the server instance.
- `lib/mcp/server.ts`
  Registers the seventeen tools, the JSON resource, and the HTML UI resource.
- `lib/dal/ui-settings.ts`
  Loads default column settings.
- `messages/en.json` and `messages/sv.json`
  Provide static UI labels for the app, CSV export, and MCP human-readable
  output.
- `lib/requirements/service.ts`
  Shared application service used by both MCP and REST routes. Holds lookup,
  detail, mutation, transition, logging, and auth hook logic.
- `lib/requirements/errors.ts`
  Typed domain errors and error-code-to-HTTP-status mapping.
- `lib/requirements/logging.ts`
  Structured JSON logging for requirements operations.
- `lib/requirements/auth.ts`
  Request and actor context types, plus authorization seams.
- `lib/dal/requirements.ts`
  Persistence logic for requirement lifecycle, versioning, transitions,
  restore, and paging counts.
- `lib/dal/requirements-specifications.ts`
  Persistence logic for requirements specifications: listing specifications and
  items,
  linking and unlinking requirements, and needs reference management.
- `lib/dal/improvement-suggestions.ts`
  Persistence logic for improvement suggestion CRUD, lifecycle
  transitions, and counts.

## Request Flow

1. `app/api/mcp/route.ts` receives the HTTP request.
2. `lib/mcp/http.ts` creates a logger, service, MCP server, and fresh transport.
3. `lib/mcp/server.ts` validates tool input with Zod and delegates to the
   shared service.
4. `lib/requirements/service.ts` enforces authorization hooks, logs the
   operation, calls the DAL, and formats the response.
5. The MCP layer returns:
   - `content` for human-readable output
   - `structuredContent` for machine-readable output
   - `isError: true` for business failures
   - app/resource links where relevant

The same service is used by the REST routes under `app/api/requirements`, which
keeps lifecycle behavior aligned between REST and MCP.

## Tool Design

The MCP surface is split into five areas: import contracts and execution,
individual requirements, requirements specifications, improvement suggestions,
and import support reference management for Normbibliotek rows and
specification-scoped needs references.

### `requirements_query_catalog`

Combines:

- requirement listing
- free-text search
- lookup tables for areas, categories, types, quality characteristics,
  priority levels, statuses, usage statuses, requirement packages, and transitions

Requirement list/search requires both `catalog` and `operation`. It supports
sorting, archive inclusion, taxonomy filters, status filters, verifiability
filters, norm-reference filters, and requirement-package filters. Lookup
catalogs ignore requirement-only filters except `typeId`, which filters the
`quality_characteristics` catalog.

Each numeric requirement filter array accepts at most 200 unique positive
integer IDs. The MCP schema rejects duplicate or oversized collections, and
the shared requirement-list boundary independently rejects oversized arrays,
before the requirements service can expand the filters into SQL parameters.

Requirement version status, usage status, and priority-level catalog rows expose
nullable `iconName` fields. Requirement list/detail version output also carries
status icon data and priority-level icon data as additive fields so older
clients can keep using the existing status and priority-level names.

The `requirements` list/search branch returns `result` plus `pagination`
without an exact total. Its default page size is 50 and `limit` accepts 1
through 100. It uses the shared Requirements Library page operation, and
callers continue with `pagination.nextCursor`. A reduced continuation limit is
valid. On `invalid_cursor`, callers restart without `cursor` while retaining
normalized filters, locale, and sort.

Requirement search uses SQL Server and the single `search` value against `id`,
`uniqueId`, `version.description`, and `version.acceptanceCriteria`. Its rows
include `match.matchedFields` without `match.quality`. Lookup search uses stable
lookup fields and retains both match fields. Search rows include
`match.quality` only for lookup catalogs. Those catalogs remain non-paginated
and return `{ result: [...] }`. No branch accepts `responseFormat` or `offset`.

This avoids a larger set of narrowly scoped read tools.

### `requirements_get_import_schema`

Returns the canonical JSON Schema for producing a `Kravimportfil`. The returned
schema is the mandatory contract for generated import JSON.

- **Inputs:** none
- **Output:** the JSON Schema object directly in `structuredContent`
- **Text content:** short status text that points to `structuredContent`
- **Grouping:** import contracts

### `requirements_get_import_instruction`

Returns the canonical `Importinstruktion` Markdown for producing a
`Kravimportfil`. The instruction is Kravhantering guidance and does not override
or replace the JSON Schema.

- **Inputs:** `locale` (`en` | `sv`, default `en`) and required `destination`.
  Use `{kind:"requirements_library"}` for kravbiblioteksimport; no requirement
  area is needed because the library import instruction does not vary by area.
  Use `{kind:"requirements_specification", specificationId}` for
  kravunderlagsimport. If an agent does not know which requirements
  specification applies, it must ask the user and call `list_destinations` or
  `search_destinations` to resolve `specificationId`.
- **Output:** Markdown in `structuredContent.importInstruction`
- **Text content:** short status text that points to
  `structuredContent.importInstruction`
- **Grouping:** import contracts

The returned requirement-package reference data is shared with REST and
built-in AI-assisted authoring. Keep it limited to stable ID, package name, and
purpose and scope; never add package-lead names, HSA IDs, email addresses, or
other structured person identifiers. The MCP registry intentionally contains
no server-hosted AI generation tool. External MCP-client provider egress is
client-owned and is not protected by the app's AI request privacy minimum.
Provider and model admission allowlisting remains tracked by
[the separate allowlisting work](https://github.com/viscalyx/Kravhantering/issues/194).

### `requirements_manage_norm_reference`

Lists, searches, gets, or creates Normbibliotek rows used by import, and lists
connected library Krav IDs for one row. List/search default to active rows only.
`includeArchived` exists for diagnostics, but archived norm references are
rejected by import validation.

List/search return full canonical Normbibliotek row properties in
`structuredContent.result`; search rows may add `match` metadata. These normal
discovery operations must not include connected krav rows, IDs, or counts. Keep
that usage data behind `operation: "list_connected_requirement_ids"` so agents
do not receive usage projections unless they ask for them.

Exact read operations accept exactly one selector: numeric `id` or stable
`normReferenceId`. `operation: "get"` returns
`structuredContent.normReference` and includes archived rows. The
`operation: "list_connected_requirement_ids"` call returns
`structuredContent.requirements[]` with `{ id, uniqueId }` for connected
library Krav, deduplicated across linked kravversioner and sorted by `uniqueId`.
It does not include kravunderlagslokala krav.

Create delegates to the existing audited norm-reference mutation workflow and
returns `structuredContent.normReference`.

When `normReferenceId` is omitted, create allocates the generated base ID then
deterministic suffixes through `-999`. Concurrent calls retry the complete
create-and-audit transaction after only the named
`uq_norm_references_norm_reference_id` duplicate-key error. An explicit
duplicate returns `isError: true` with
`structuredContent.error` set to
`{ code: "conflict", reason: "norm_reference_id_exists" }`.
Generated-ID exhaustion instead uses reason
`norm_reference_id_generation_exhausted`. Keep this error union in the MCP
output schema, tool description, user guide, and MCP tests.

### `requirements_manage_needs_reference`

Lists, searches, gets, or creates behovsreferenser for one requirements
specification. The tool exists so MCP clients can resolve
`requirements[].needsReferenceId` before validating a kravunderlagsimport.
Inputs always include numeric `specificationId` from
`requirements_manage_import` destination discovery.

List/search return `structuredContent.result[]` with canonical
specification-needs-reference row properties. Search rows may add `match`
metadata. `operation: "get"` requires `needsReferenceId` and returns
`structuredContent.needsReference`. `operation: "create"` accepts `text` and
optional `description`, creates the row through the shared requirements service,
and returns `structuredContent.needsReference`.

Tool descriptions must tell agents to ask the user before `operation: "create"`
for a missing behovsreferens. After approval, the agent creates the row and
copies `needsReference.id` to `requirements[].needsReferenceId` before
`requirements_manage_import` execute. If the user does not approve creation,
the agent asks whether import without the needs-reference link is acceptable and
stops when the missing link is central to why the row belongs in the
specification. MCP has no human import-review step between validate and
execute, so unresolved `proposedNeedsReferences` must not be treated as
something a later MCP step resolves automatically.

Document these copy paths in tool descriptions and tests:

```text
requirements_manage_import.result[].specificationId -> specificationId
requirements_manage_needs_reference.result[].id -> requirements[].needsReferenceId
requirements_manage_needs_reference.needsReference.id -> requirements[].needsReferenceId
```

### `requirements_manage_import`

Manages persisted MCP import validation sessions.

- `list_destinations` and `search_destinations` return import destinations the
  actor can write to.
- `validate` accepts `{kind:"requirements_library", areaId}` or
  `{kind:"requirements_specification", specificationId}` plus a raw
  `Kravimportfil` payload. Schema-valid payloads create a SQL-backed validation
  session even when individual rows have errors.
- Validation sessions are immutable after `validate`.
- Validation sessions are bound to a purpose-separated keyed HMAC of the
  normalized HSA-id principal. Persist only that fingerprint, never raw HSA-id.
- `execute` accepts only `validationToken`. It imports all unconsumed rows
  without errors in the same transaction that marks the session rows consumed,
  after locking the owned session and re-authorizing and re-checking the stored
  destination inside that serializable transaction.
- `inspect_validation` accepts only `validationToken` and returns full
  submitted/resolved row details, proposals, reference-data freshness, and
  imported state.
- If a caller needs to recover after a lost or uncertain execute response,
  `inspect_validation` is the row-state recovery path. Build a corrected
  `Kravimportfil` from rows that were not successfully imported, then run
  `validate` and `execute` with a new token. Do not copy successfully imported
  rows into the corrected payload because cross-session duplicate detection is
  not generic.

Validation tokens are random 32-byte base64url values. Only SHA-256 token hashes
are stored. Ownership lookup always combines token hash and creator fingerprint;
a wrong principal must receive the same public not-found result. The fingerprint
key is purpose-separated from `AUTH_SESSION_COOKIE_PASSWORD`, so rotating that
secret invalidates existing ownership matches. `validation_result_json` stores
resolved row state, issues, proposal metadata, and reference-data include names;
the submitted payload and execution receipts are stored separately. Session
TTL, row cap, byte cap and principal/destination/rate/storage quotas come from
`ai_settings`.

Creation admission is atomic under a SQL Server transaction-owned application
lock and serializable transaction. Count only `expires_at > SYSUTCDATETIME()`;
executed sessions remain active. Use fixed epoch-aligned 10-minute buckets and
increment only after a successful session insert in the same transaction.
Preserve rejection precedence: principal, rate, destination, storage. Equality
is allowed. Reserve UTF-16 JSON bytes plus fixed overhead and a conservative
per-row execution receipt before inserting.

### `requirements_get_requirement`

Supports:

- current detail using the highest-numbered published version only
- a specific version
- full version history

The caller selects the behavior with `view`. Default detail reads must not fall
back to draft, review, or archived versions. Those versions are only returned
for explicit `view: "version"` or `view: "history"` requests.

### `requirements_manage_requirement`

Supports:

- `create`
- `edit`
- `archive`
- `delete_draft`
- `restore_version`

Edit calls must first fetch the requirement with `view: "history"` and copy
`requirement.versions[0].id` and `requirement.versions[0].revisionToken` into
`requirement.baseVersionId` and
`requirement.baseRevisionToken`. The shared service maps stale base-version
tokens to `409 Conflict` details with `reason: "stale_requirement_edit"` and
the latest requirement snapshot.

`requirement.normReferenceIds` and `requirement.requirementPackageIds` each
accept at most 200 unique positive integer IDs. The MCP schema rejects
duplicates and oversized collections before service delegation. The shared
taxonomy-reference boundary independently caps direct callers, deduplicates
accepted values before lookups, and persists each collection with one bounded
multi-row insert.

Delete-draft results use one canonical shape across REST and MCP:
`result.deleted` is an ordered deletion ledger. It contains a
`draftRequirementVersion` item with `requirementUniqueId` and `versionNumber`,
followed by a `requirement` item for the same `requirementUniqueId` when the
parent requirement row was also deleted.

The shared service also supports `reactivate` for REST parity, but that
operation is intentionally not exposed as an MCP tool operation in v1.

### `requirements_transition_requirement`

Transitions a requirement through the lifecycle using `toStatusId`.

### `requirements_list_specifications`

Lists all requirements specifications with optional name filtering. Returns the
numeric `specificationId` and display `specificationCode` (e.g.
`SAKLYFT-INFOR-Q2`) for each specification. Clients should copy the numeric id
into later specification-tool inputs:

```text
requirements_list_specifications.specifications[].specificationId -> specificationId
```

### `requirements_get_specification_items`

Lists one bounded page of requirement applications linked to a specific
specification. Accepts numeric `specificationId`, all supported list filters,
`locale`, `sortBy`, `sortDirection`, an optional opaque `cursor`, and `limit`
from 1 through 100 (default 50). Filtering and ordering run over the complete
mixed library/local result in SQL Server. The response has no exact total.

Continue only with `pagination.nextCursor`; a reduced `limit` is allowed on the
next call. `invalid_cursor` means the client must restart without `cursor` and
retain its normalized filters, locale, and sort. Use the specification copy
path above. Stable `itemRef` values identify both item kinds and should be used
for mixed-item actions. Copy an `items[].id` into a legacy library-only removal
input only when the entry has `kind == "library"`:

```text
requirements_get_specification_items.items[].itemRef -> itemRef
requirements_get_specification_items.items[kind == "library"].id -> requirementIds
```

### `requirements_add_to_specification`

Links from 1 through 200 unique requirements to a specification. Accepts
numeric `specificationId`. Requirements without a published version are
skipped and returned in `skippedIds` rather than causing an error — this lets
an agent batch-add requirements without needing to pre-filter by publish state.
`needsReferenceId` links the added items to an existing specification-local
needs reference. `needsReferenceText` creates a new
`specification_needs_references` row, with optional
`needsReferenceDescription`, and links it to all added items. The tool rejects
duplicate `needsReferenceText` values inside the same specification. Use the
specification copy paths above, and copy requirement IDs from:

```text
requirements_query_catalog.result[].id -> requirementIds
```

### `requirements_list_graduation_target_areas`

Lists requirement areas the actor may use as targets when graduating a specific
specification-local requirement. The caller passes the same source fields used
by `requirements_graduate_local_requirement`: `specificationId`, plus
`localRequirementId`. The service enforces source
specification authorship before confirming the local requirement exists, then
returns only areas owned or co-authored by the actor. Clients should use one
returned `areas[].id` as `requirementAreaId` for graduation.

### `requirements_graduate_local_requirement`

Copies a specification-local requirement into a target library requirement area
as a new Draft library requirement, regardless of its usage status. The workflow
is copy-only: it does not replace, delete, or link the source
specification-local row, and it does not move local deviations. The service
enforces target requirement-area ownership or co-authorship and source
specification authorship before calling the transactional DAL copy operation.

### `requirements_remove_from_specification`

Unlinks from 1 through 200 unique requirements from a specification. Accepts
numeric `specificationId`. The MCP schema and shared service boundary reject
empty, duplicate, and oversized `requirementIds` collections before mutation
work. The requirements themselves are not deleted. The operation is idempotent
— removing an ID that is not in the specification produces no error. Use the
specification copy path above, and copy only library requirement IDs from:

```text
requirements_get_specification_items.items[kind == "library"].id -> requirementIds
```

### `requirements_list_improvement_suggestions`

Lists improvement suggestions for a specific requirement. Identify the
requirement by numeric `requirementId` or by `uniqueId` (e.g. `REQ-001`).
Exactly one identifier must be provided.

- **Inputs:** `requirementId` (number, optional), `uniqueId` (string,
  optional), `locale` (`en` | `sv`), `responseFormat` (`json` | `markdown`)
- **Output:** list of suggestions with content, lifecycle state, resolution,
  and audit timestamps
- **Grouping:** improvement suggestions

### `requirements_manage_improvement_suggestion`

Creates, edits, deletes, transitions, or resolves an improvement suggestion.

- **Operations:** `create`, `edit`, `delete`, `request_review`,
  `revert_to_draft`, `resolve`, `dismiss`
- **Inputs:** `operation`, `suggestionId` (required except for `create`),
  `requirementId` (required for `create`), `content` (required for
  `create`/`edit`), `createdBy`, `requirementVersionId`,
  `resolutionMotivation`, `resolvedBy`, `locale`, `responseFormat`
- **Output:** confirmation message and updated suggestion data
- **Grouping:** improvement suggestions

## Resource Design

### JSON Resource

`requirements://requirement/{uniqueId}` returns JSON detail for a requirement.
`?version=<number>` switches to a specific version.

This gives compatible clients a read-only resource surface without creating
extra tools.

### UI Resource

`ui://requirements/requirement-detail/{uniqueId}` returns HTML for MCP
Apps-capable clients.

The UI resource is linked from `get`, `manage`, and `transition` tool results
through:

- a `resource_link` in `content`
- `_meta["openai/outputTemplate"]`

The server still returns usable text and `structuredContent` when the client
does not support MCP Apps.

## Shared Service Responsibilities

`lib/requirements/service.ts` is the business boundary. Add behavior here
before adding transport-specific logic.

It owns:

- catalog listing and search
- catalog list/search result arrays
- detail and version-history lookup
- create, edit, archive, delete draft, reactivate, and restore flows
- lifecycle transitions
- specification listing, item lookup, link, and unlink flows
- response formatting
- logging
- authorization hook calls
- REST-friendly error mapping via `toHttpErrorPayload`

Human-readable MCP labels should stay aligned with the app and CSV output by
using explicit keys from `messages/en.json` and `messages/sv.json` rather than
hardcoded English-only text.

## Import budget resolution and consistency

MCP HTTP setup uses cached AI settings for transport limits and informational
metadata. It does not load application settings to advertise a row limit.
Non-import calls, discovery and destination listing do not resolve the import
budget. Import schema and instruction calls still load their own global budget.

`manageImport` loads strict, uncached settings for `validate` and `execute`.
The effective row ceiling is always:

```text
min(AI MCP row limit, global requirement-import row budget)
```

Validation first checks content against fresh settings, then rechecks the
budget fingerprint inside the serializable session-admission transaction,
before quota settings and session writes. A concurrent change produces a
conflict asking the client to validate again. Execution reads both settings
inside its serializable mutation transaction; a changed fingerprint returns
`import_budget_stale` before reference work or writes. Existing tokens do not
reserve the right to use an older ceiling.

Both transactions acquire the application-settings update lock before reading
AI settings and retain their SQL Server locks until commit. This avoids lock
upgrade deadlocks with an AI settings update, and serializes budget admission
and execution while these locks are held. Admin PATCH writes acquire
application settings and then AI settings locks in the same order. If the
PATCH commits first, admission/execution observes its values. If import locks
win first,
the PATCH waits for that import transaction to finish. An import may return
its response after a PATCH response due to network scheduling, but its database
admission or mutation is ordered before that PATCH. This contract applies to
all processes and nodes using the same writable SQL Server database; no
replica reads or cross-node message delivery participate in enforcement.

A successful AI settings PATCH refreshes that process's metadata cache after
commit. A global-budget PATCH also clamps the persisted AI row limit in the
same transaction. Neither PATCH needs import-budget cache invalidation because
there is no enforcement cache. Remote metadata can remain stale for its
30-second TTL; advertised values are explicitly informational. Failed PATCH
transactions do not publish new limits. Missing, invalid or unreadable import
settings fail closed without cached or default substitution. Admission failures
create no session, and execution failures roll back without a receipt or rows.
SQL lock timeouts and deadlock victims also fail closed; callers can retry.

The design choices for issue #995 are:

- **Lazy database reads (selected):** remove the unconditional HTTP read and
  resolve only where import functionality needs the budget. Transactional
  rechecks close the race between validation work and session admission.
- **Cache with local and cross-node invalidation:** local refresh is
  insufficient. Reliable invalidation would require every process to
  acknowledge a reduction before PATCH success, or a database version check
  at admission. The latter still reads the database; the former adds a
  distributed coordination dependency without a useful benefit here.
- **Bounded staleness:** a positive TTL alone can accept rows above a newly
  lowered ceiling. It is safe only with an authoritative admission check or
  a cached lower bound guaranteed never to exceed any future setting. An
  ordinary cached value has no such guarantee, so enforcement uses no TTL.

`requirements.manage_import.budget_resolution` logs operation, phase,
request ID, `source: database`, outcome and read duration. Successful reads
include
`global_max_rows`, `ai_max_rows` and `effective_max_rows`.
`requirements.manage_import.budget_stale` identifies fingerprint mismatches
and the affected operation. These events contain no payload, token, raw
settings-read error or principal data. Correlate by request ID and the log
collector's process/node labels. Repeated failures indicate database/settings
health; stale events indicate a concurrent administrator change.

Focused HTTP, service and DAL tests cover discovery independence, both limit
reductions, independent consumers with stale metadata, admission rechecks,
execution rejection and read failures. The SQL integration quota suite checks
transactional admission and concurrent admin updates against SQL Server.

## Lifecycle Normalization

The shared service and DAL provide one lifecycle behavior contract for routes:

- archiving updates both `requirements.isArchived` and version state
- transition-to-archived keeps the requirement and version records in sync
- restoring an archived version clears the requirement archive flag and creates
  a new draft version
- publishing auto-archives any existing Published version for the same
  requirement
- restoring a version copies requirement packages and references into the new draft

## Logging

The server writes structured JSON logs through
`lib/requirements/logging.ts`.

Typical fields include:

- `event`
- `request_id`
- `actor_id`
- `source`
- `tool_name`
- `requirement_unique_id`
- `requirement_id`
- `version_number`
- `duration_ms`

Use the existing logger interface instead of ad hoc `console.log` statements so
REST and MCP telemetry stay consistent.

Quota and ownership diagnostics may contain only stable event/operation,
outcome/reason, timestamps/durations, aggregate counts/limits, and short
principal/destination fingerprint prefixes. Never log raw HSA-id, destination
ID/name, session ID, token/hash, submitted payload, stored validation/execution
JSON, row identifiers or issue arrays.

## Error Handling

Use typed domain errors from `lib/requirements/errors.ts`.

Supported codes:

- `not_found`
- `validation`
- `conflict`
- `unauthorized`
- `forbidden`
- `internal`

Rules:

- Service and DAL code should throw typed domain errors for expected business
  failures.
- MCP tool handlers should catch and return tool-level failures with
  `isError: true`.
- Validation, conflict, authorization, and not-found domain errors may expose
  their user-facing message.
- Unexpected errors and `internal` domain errors must return only
  `Error: An internal error occurred`.
- Authorization denial evidence is required and fail-closed. If its action-log
  write fails, keep the protected work blocked, emit the redacted
  `auth.authorization.denied.audit_failed` security event, and throw an
  `internal` domain error. MCP must return only the generic internal message,
  without authorization or persistence details.
- REST routes should map errors with `toHttpErrorPayload`.
- Do not leak stack traces or raw database errors into tool results.

## Authorization Seams

Authentication and authorization are intentionally split from the core
requirements logic.

Current extension points:

- `ActorContext`
- `RequestContext`
- `AuthorizationService`
- `createRequestContext(...)`
- `AssignmentBasedAuthorizationService`
- `RoleBasedAuthorizationService`

Current behavior:

- Enabled MCP and REST requests build a request context from a verified identity
  source only: the iron-session cookie for browser/REST callers, or a
  verified `Authorization: Bearer` JWT for MCP callers. MCP authentication is
  mandatory when `MCP_CLIENT_ID` enables the endpoint,
  and the app does not accept `x-user-id` or `x-user-roles` request
  headers as a stand-in for a logged-in user; `proxy.ts` strips both
  headers from every inbound request before any handler runs.
- An empty `MCP_CLIENT_ID` makes the MCP route return `404` before Bearer,
  discovery, audit, database, settings, transport, or service work. Invalid
  enabled configuration fails readiness and returns the redacted
  authentication-configuration response before database acquisition.
- The MCP HTTP route verifies a service access token against the IdP's JWKS,
  then validates `at+jwt`, `exp`, `sub`, `iat`, bounded age and lifetime,
  exact `client_id`, required scopes, HSA-id, and the configured strict role
  claim. The verified actor is attached to the in-flight `Request` object
  via an in-process `WeakMap<Request, ActorContext>` in
  `lib/requirements/auth.ts` (`attachVerifiedActor`). The MCP server
  picks it up through `createRequestContext(request, 'mcp', ...)` without
  trusting any request header. Tests can use the same seam to inject
  verified actors.
- Missing or invalid Bearer tokens return `401` with `WWW-Authenticate:
  Bearer` and a stable JSON-RPC error body before service or tool handling
  runs. Authentication configuration failures return `500`; discovery and
  remote JWKS availability failures return `503`. All authentication failures
  retain the Bearer challenge and generic public messages.
- `McpAuthError` derives its public message and status from an allowlisted
  internal reason. Rejection audit events contain only that reason, never raw
  verifier text, runtime error names, tokens, claims, client IDs, issuer
  details, or network endpoints.
- The default REST and MCP service wiring uses
  `AssignmentBasedAuthorizationService` via
  `createDefaultAuthorizationService(db)`. It resolves the target resource in
  the database and fails closed for unknown or unresolvable actions. Tests that
  isolate business-flow behavior may inject a local test `AuthorizationService`
  double, but shared runtime wiring must not provide a permissive authorization
  implementation.

When implementing auth:

- keep auth decisions out of `lib/mcp/server.ts`
- keep tool schemas stable
- populate actor data at the HTTP edge
- enforce authorization in the shared service

## How To Add Or Change Functionality

### Change Behavior

1. Start in `lib/requirements/service.ts`.
2. Update or add DAL operations if persistence changes are required.
3. Reuse existing typed errors and logging.
4. Only change `lib/mcp/server.ts` if the MCP contract must change.
5. Keep the tool count small unless a new tool removes real agent friction.

### Add New Tool Inputs

If a tool needs extra arguments:

1. Extend the Zod schema in `lib/mcp/server.ts`.
2. Update the corresponding `to*Input(...)` adapter.
3. Extend the shared service input type.
4. Update tests and documentation.

Prefer expanding an existing tool when the behavior is closely related. For
example, lookups were intentionally folded into `requirements_query_catalog`
instead of creating one tool per lookup table.

### Add A New Resource Or App

1. Decide whether the workflow needs a resource or an actual tool.
2. Register the resource in `lib/mcp/server.ts`.
3. Keep a non-UI fallback in the tool response.
4. Avoid making the UI resource the only path to data.

## Testing

Unit and transport coverage for the MCP server lives in:

- `tests/unit/requirements-service.test.ts`
- `tests/unit/mcp-http.test.ts`
- `tests/unit/mcp-token.test.ts`
- `tests/unit/mcp-security.test.ts`
- `tests/unit/mcp-authz.test.ts`
- `tests/unit/mcp-property.test.ts`

Useful commands:

- `npm run type-check`
- Focused MCP security suite:

  ```sh
  npm exec -- vitest run \
    tests/unit/mcp-http.test.ts \
    tests/unit/mcp-token.test.ts \
    tests/unit/mcp-security.test.ts \
    tests/unit/mcp-authz.test.ts \
    tests/unit/mcp-property.test.ts
  ```

- Focused MCP lint:

  ```sh
  npm run lint -- \
    app/api/mcp/route.ts \
    lib/mcp/http.ts \
    lib/mcp/server.ts \
    lib/requirements/service.ts \
    tests/unit/mcp-http.test.ts \
    tests/unit/mcp-token.test.ts \
    tests/unit/mcp-security.test.ts \
    tests/unit/mcp-authz.test.ts \
    tests/unit/mcp-property.test.ts
  ```

Manual verification should still include:

- connecting an MCP client to `/api/mcp` with a non-production Bearer token
- checking that all seventeen tools appear
- checking that the JSON resource resolves
- checking that the requirement view app renders in a client with MCP Apps
  support
- verifying specification tools: list specifications, get items for a
  specification, list graduation target requirement areas, add a requirement,
  graduate a local requirement, and remove a linked requirement again

## Local Development Notes

The MCP server uses the same SQL Server + TypeORM stack as the rest of the
app. See
[sql-server-developer-workflow.md](../development/sql-server-developer-workflow.md)
for the full setup.

- Start the DB service with `npm run db:up` and prepare it with
  `npm run db:setup`.
- Start the app with `npm run dev`.
- The MCP endpoint will be available at `http://localhost:3000/api/mcp`.
- Because the server is inside the app, local debugging usually means watching:
  - the Next.js dev server output
  - Visual Studio Code MCP output
  - browser or chat traces from the MCP client

## Deployment Notes

- The server is meant to be deployed with the web app in the same Next.js
  container runtime.
- The current repository targets a dev-first workflow now and an
  OpenShift-compatible container deployment later.
- The current implementation is stateless and creates a fresh transport per
  request.
- Public deployments must keep `/api/mcp` behind HTTPS and the configured IdP
  Bearer-token validation.

## Related Docs

- [mcp-server-user-guide.md](./mcp-server-user-guide.md)
