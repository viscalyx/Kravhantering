# MCP Server Contributor Guide

## Purpose

This guide explains how the in-project MCP server is structured, how it maps to
the shared requirements service, and how to extend it without fragmenting the
tool surface.

For end-user setup and client examples, see
[mcp-server-user-guide.md](./mcp-server-user-guide.md).

For admin-managed UI terminology and default column settings, see
[admin-center.md](./admin-center.md).

## Server Contract

- Server name: `requirement-management-mcp-server`
- Endpoint: `/api/mcp`
- Runtime: Next.js edge route in this application
- Transport: stateless Streamable HTTP
- Primary public identifier: `uniqueId`
- Read response formats: `markdown`, `json`
- Supported locales: `en`, `sv`
- Exposed MCP tools: 10
- Exposed MCP resources:
  - `requirements://requirement/{uniqueId}`
  - `ui://requirements/requirement-detail/{uniqueId}`

## File Map

- `app/api/mcp/route.ts`
  Edge entrypoint that builds the DB handle and forwards the request into the
  MCP transport handler.
- `lib/mcp/http.ts`
  Creates a fresh `WebStandardStreamableHTTPServerTransport` for each request
  and connects the server instance.
- `lib/mcp/server.ts`
  Registers the ten tools, the JSON resource, and the HTML UI resource.
- `lib/dal/ui-settings.ts`
  Loads DB-backed UI terminology and default column settings.
- `lib/ui-terminology.ts`
  Maps stored terminology onto translation keys used by the app, CSV export,
  and MCP human-readable output.
- `lib/requirements/service.ts`
  Shared application service used by both MCP and REST routes. Holds lookup,
  detail, mutation, transition, pagination, logging, and auth hook logic.
- `lib/requirements/errors.ts`
  Typed domain errors and error-code-to-HTTP-status mapping.
- `lib/requirements/logging.ts`
  Structured JSON logging for requirements operations.
- `lib/requirements/auth.ts`
  Request and actor context types, plus authorization seams.
- `lib/dal/requirements.ts`
  Persistence logic for requirement lifecycle, versioning, transitions,
  restore, and paging counts.
- `lib/dal/requirement-packages.ts`
  Persistence logic for requirement packages: listing packages and items,
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

The MCP surface is split into two areas: individual requirements (four tools)
and requirement packages (four tools).

### `requirements_query_catalog`

Combines:

- requirement listing
- free-text search
- lookup tables for areas, categories, types, quality characteristics,
  statuses, scenarios, and transitions

This avoids a larger set of narrowly scoped read tools.

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

The shared service also supports `reactivate` for REST parity, but that
operation is intentionally not exposed as an MCP tool operation in v1.

### `requirements_transition_requirement`

Transitions a requirement through the lifecycle using `toStatusId`.

### `requirements_list_packages`

Lists all requirement packages with optional name filtering. Returns the
numeric `id` and `uniqueId` (slug, e.g. `SAKLYFT-Q2`) for each package.

### `requirements_get_package_items`

Lists requirements linked to a specific package. Accepts `packageId`
(numeric) or `packageSlug` (e.g. `SAKLYFT-Q2`). Supports optional
`descriptionSearch` for client-side filtering.

### `requirements_add_to_package`

Links requirements to a package. Accepts `packageId` (numeric) or
`packageSlug` (e.g. `SAKLYFT-Q2`). Requirements without a published version
are skipped and returned in `skippedIds` rather than causing an error — this
lets an agent batch-add requirements without needing to pre-filter by publish
state. An optional `needsReferenceText` is resolved to a
`package_needs_references` row (created if needed) and linked to all added
items.

### `requirements_remove_from_package`

Unlinks requirements from a package. Accepts `packageId` (numeric) or
`packageSlug` (e.g. `SAKLYFT-Q2`). The requirements themselves are not
deleted. The operation is idempotent — removing an ID that is not in the
package produces no error.

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
- pagination metadata
- detail and version-history lookup
- create, edit, archive, delete draft, reactivate, and restore flows
- lifecycle transitions
- package listing, item lookup, link, and unlink flows
- response formatting
- logging
- authorization hook calls
- REST-friendly error mapping via `toHttpErrorPayload`

Human-readable MCP labels should stay aligned with the app and CSV output by
using the shared UI terminology layer rather than hardcoded English-only text.

## Lifecycle Normalization

The shared service and DAL normalize behavior that previously drifted between
routes:

- archiving updates both `requirements.isArchived` and version state
- transition-to-archived keeps the requirement and version records in sync
- restoring an archived version clears the requirement archive flag and creates
  a new draft version
- publishing preserves the existing behavior where the previously published
  version is auto-archived
- restoring a version copies scenarios and references into the new draft

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
- `AllowAllAuthorizationService`
- `RoleBasedAuthorizationService`

Current behavior:

- MCP and REST requests build a request context from headers.
- The default service wiring uses `AllowAllAuthorizationService`.
- Auth is planned, but not enforced, at the MCP route yet.

When implementing auth:

- keep auth decisions out of `lib/mcp/server.ts`
- keep tool schemas stable
- populate actor data at the HTTP edge
- enforce authorization in the shared service

See [TODO-mcp-server-auth-plan.md](./TODO-mcp-server-auth-plan.md).

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

Useful commands:

- `npm run type-check`
- `npm test -- tests/unit/requirements-service.test.ts tests/unit/mcp-http.test.ts`
- `npm run lint -- app/api/mcp/route.ts lib/mcp/http.ts lib/mcp/server.ts lib/requirements/service.ts`

Manual verification should still include:

- connecting an MCP client to `/api/mcp`
- checking that all ten tools appear
- checking that the JSON resource resolves
- checking that the requirement view app renders in a client with MCP Apps
  support
- verifying package tools: list packages, get items for a package, add a
  requirement, and remove it again

## Local Development Notes

- Start the app with `npm run dev`.
- The MCP endpoint will be available at `http://localhost:3000/api/mcp`.
- Because the server is inside the app, local debugging usually means watching:
  - the Next.js dev server output
  - Visual Studio Code MCP output
  - browser or chat traces from the MCP client

## Deployment Notes

- The server is meant to be deployed with the web app on Cloudflare through the
  existing Next.js setup.
- The current implementation is stateless and creates a fresh transport per
  request.
- If you expose the route publicly before the auth phase lands, protect the
  route at the platform edge.

## Related Docs

- [mcp-server-user-guide.md](./mcp-server-user-guide.md)
- [TODO-mcp-server-auth-plan.md](./TODO-mcp-server-auth-plan.md)
- [requirements-mcp-evaluation.xml](./requirements-mcp-evaluation.xml)
