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
- Exposed MCP tools: 16
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
  Registers the sixteen tools, the JSON resource, and the HTML UI resource.
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

The MCP surface is split into five areas: import contracts and execution (four
tools), individual requirements (four tools), requirements specifications (six
tools), improvement suggestions (two tools), and Normbibliotek management
through the import support tool.

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

Requirement version status, usage status, and priority-level catalog rows expose
nullable `iconName` fields. Requirement list/detail version output also carries
status icon data and priority-level icon data as additive fields so older
clients can keep using the existing status and priority-level names.

Every `requirements_query_catalog` list/search operation returns the structured
MCP contract `{ result: [...] }`. Requirement search uses `search` against `id`,
`uniqueId`, `version.description`, and `version.acceptanceCriteria`. Lookup
search uses stable lookup fields. Search rows include `match.quality` and
`match.matchedFields` metadata. These operations do not accept `responseFormat`,
`limit`, or `offset`, and they do not use pagination wrappers.

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

- **Inputs:** `locale` (`en` | `sv`, default `en`)
- **Output:** Markdown in `structuredContent.importInstruction`
- **Text content:** short status text that points to
  `structuredContent.importInstruction`
- **Grouping:** import contracts

### `requirements_manage_norm_reference`

Lists, searches, or creates Normbibliotek rows used by import. List/search
default to active rows only. `includeArchived` exists for diagnostics, but
archived norm references are rejected by import validation. Create delegates to
the existing audited norm-reference mutation workflow and returns
`structuredContent.normReference`.

### `requirements_manage_import`

Manages persisted MCP import validation sessions.

- `list_destinations` and `search_destinations` return import destinations the
  actor can write to.
- `validate` accepts `{kind:"requirements_library", areaId}` or
  `{kind:"requirements_specification", specificationId}` plus a raw
  `Kravimportfil` payload. Schema-valid payloads create a SQL-backed validation
  session even when individual rows have errors.
- Validation sessions are immutable after `validate`.
- `execute` accepts only `validationToken`. It imports all unconsumed rows
  without errors in the same transaction that marks the session rows consumed,
  after re-checking that the stored destination still exists.
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
are stored. `validation_result_json` stores resolved row state, issues,
proposal metadata, and reference-data include names; the submitted payload and
execution receipts are stored separately. Session TTL, row cap, and byte cap
come from `ai_settings`.

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

Lists requirement applications linked to a specific specification. Accepts
numeric `specificationId`. Supports optional `descriptionSearch` for client-side
filtering. Use the specification copy path above. Returned linked requirement
IDs can be copied into removal inputs:

```text
requirements_get_specification_items.items[].id -> requirementIds
```

### `requirements_add_to_specification`

Links requirements to a specification. Accepts numeric `specificationId`.
Requirements without a published
version are skipped and returned in `skippedIds` rather than causing an error —
this lets an agent batch-add requirements without needing to pre-filter by
publish state. `needsReferenceId` links the added items to an existing
specification-local needs reference. `needsReferenceText` creates a new
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

Unlinks requirements from a specification. Accepts numeric `specificationId`.
The requirements themselves are not deleted. The operation is idempotent —
removing an ID that is not in the specification produces no error. Use the
specification copy path above, and copy linked requirement IDs from:

```text
requirements_get_specification_items.items[].id -> requirementIds
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

- MCP and REST requests build a request context from a verified identity
  source only: the iron-session cookie for browser/REST callers, or a
  verified `Authorization: Bearer` JWT for MCP callers. Auth is mandatory,
  and the app does not accept `x-user-id` or `x-user-roles` request
  headers as a stand-in for a logged-in user; `proxy.ts` strips both
  headers from every inbound request before any handler runs.
- The MCP HTTP route additionally verifies a Bearer JWT against the IdP's
  JWKS. The verified actor is attached to the in-flight `Request` object
  via an in-process `WeakMap<Request, ActorContext>` in
  `lib/requirements/auth.ts` (`attachVerifiedActor`). The MCP server
  picks it up through `createRequestContext(request, 'mcp', ...)` without
  trusting any request header. Tests can use the same seam to inject
  verified actors.
- Missing or invalid Bearer tokens return `401` with `WWW-Authenticate:
  Bearer` and a JSON-RPC error body before service or tool handling runs.
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
- checking that all fourteen tools appear
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
- [requirements-mcp-evaluation.xml](./requirements-mcp-evaluation.xml)
