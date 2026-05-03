# MCP Server User Guide

## Overview

This project exposes a requirements-management MCP server named
`requirement-management-mcp-server`.

- Transport: stateless Streamable HTTP
- Endpoint: `/api/mcp`
- Local URL: `http://localhost:3000/api/mcp`
- Public identifier for requirements: `uniqueId`
- Read formats: `markdown` or `json`
- Locales: `en` or `sv`

The server is designed for MCP-capable clients such as Visual Studio Code and
GitHub Copilot coding agent. It keeps the tool surface intentionally small so
agents can use it reliably.

## What The Server Exposes

### Tools

#### Requirements

- `requirements_query_catalog`
  List or search requirements and fetch lookup catalogs such as areas,
  categories, types, quality characteristics, risk levels, statuses,
  scenarios, and transitions.
- `requirements_get_requirement`
  Fetch the current requirement detail, a specific version, or full version
  history.
- `requirements_manage_requirement`
  Create, edit, archive, delete the latest draft, or restore a historical
  version. For `operation: "edit"`, first fetch the requirement with
  `view: "history"` and pass `requirement.versions[0].id` and
  `requirement.versions[0].revisionToken` back as
  `requirement.baseVersionId` and `requirement.baseRevisionToken`.
- `requirements_transition_requirement`
  Move a requirement through the lifecycle using a target status ID.

#### Requirements Specifications (Kravunderlag)

- `requirements_list_specifications`
  List all requirements specifications, optionally filtered by name. Returns id,
  `uniqueId` (slug), Swedish and English names, item count, responsibility
  area, and implementation type for each specification.
- `requirements_get_specification_items`
  List requirements linked to a specific specification, with optional description
  search. Use `specificationId` (numeric) or `specificationSlug` (e.g. `SAKLYFT-INFOR-Q2`)
  from `requirements_list_specifications`.
- `requirements_add_to_specification`
  Link one or more requirements to a specification. Requirements must have a
  published version; those without are skipped and returned in `skippedIds`.
  Optionally attach a `needsReferenceText` to all added items. Use
  `specificationId` or `specificationSlug` to identify the specification.
- `requirements_remove_from_specification`
  Unlink one or more requirements from a specification. The requirements themselves
  are not deleted. Use `specificationId` or `specificationSlug` to identify the
  specification.

#### Improvement Suggestions

- `requirements_list_improvement_suggestions`
  List improvement suggestions for a specific requirement. Identify the requirement
  by numeric `requirementId` or by `uniqueId` (e.g. `REQ-001`). Returns
  suggestions with lifecycle status and resolution details.
- `requirements_manage_improvement_suggestion`
  Create, edit, delete, request review, revert to draft, resolve, or dismiss
  an improvement suggestion on a requirement. Operations: `create`, `edit`, `delete`,
  `request_review`, `revert_to_draft`, `resolve`, `dismiss`.

#### AI Generation

- `requirements_generate_requirements`
  Generate system requirements using AI (OpenRouter) based on a
  topic. Returns generated requirements with a thinking trace.
  To create the generated requirements, call
  `requirements_manage_requirement` with `operation: "create"`
  for each requirement.

### Resources

- `requirements://requirement/{uniqueId}`
  Read-only JSON resource for a requirement.
- `ui://requirements/requirement-detail/{uniqueId}`
  Read-only HTML view for MCP Apps-capable clients.

Add `?version=<number>` to either URI to target a specific version.

## Current Security Status

As of March 8, 2026, the MCP route is designed for future authentication and
authorization, but the in-route auth phase has not been enabled yet.

If you expose `/api/mcp` outside local development before that phase lands,
protect it at the platform edge.

## Run It Locally

The MCP server is part of the Next.js app and uses the same SQL Server +
TypeORM stack. For the full developer setup, see
[sql-server-developer-workflow.md](./sql-server-developer-workflow.md).

1. Install dependencies with `npm install`.
2. Start the local SQL Server with `npm run db:up`.
3. Migrate and seed the local database with `npm run db:setup`.
4. Start the app with `npm run dev`.
5. Connect your MCP client to `http://localhost:3000/api/mcp`.

The server is implemented inside the Next.js app, so there is no separate MCP
process to start.

## Configure Visual Studio Code

Visual Studio Code supports MCP server configuration in `.vscode/mcp.json` for
workspace-scoped usage or in the user profile for global usage.

Create `.vscode/mcp.json` with:

```json
{
  "servers": {
    "requirement-management": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

For a deployed environment, replace the URL with your public HTTPS origin:

```json
{
  "servers": {
    "requirement-management": {
      "type": "http",
      "url": "https://your-domain.example/api/mcp"
    }
  }
}
```

### Use It In Chat

1. Open Copilot Chat in Visual Studio Code.
2. Switch the chat mode to `Agent`.
3. Select `Configure Tools`.
4. Enable the `requirement-management` server or individual tools from it.
5. Ask a natural-language question, or explicitly reference a tool with `#`.

Examples:

- `List the published requirements for the Integration area.` (in Swedish:
  `Lista publicerade krav för integrationsområdet.`)
- `Show requirement INT0001 and include the latest version details.`
- `Show me the properties of the requirement INT0002`
- `Show me all version of the requirement IND0001 and what status each have`
  (fail case, wrong ID)
- `Show me all version of the requirement IDN0001 and what status each have`
- `Show requirement IDN0001`
- `Show me all version of IDN0001`
- `Show me the details of version 2 of IDN0001`
- `Show me requirement ANV0001` (fail case, there is no published version)
- `Use #requirements_query_catalog to list available statuses first, then move`
  `INT0001` to review.
- `Hämta krav ANV0001 med version 1 och flytta det sen till granskning`

More advanced examples:

```text
For requirement IDN0001, return a table with three columns; version numbers,
status and date. Use dates like this:
- Draft: created date
- Published: Published date
- Archived: Archive date
- Review: (no date)
```

```text
Open requirement INT0002 in the MCP app view.
```

```text
För krav-ID IDN0001, returnera en tabell med tre kolumner: versionsnummer,
status och datum. Använd datum enligt följande:
- Utkast skapandedatum
- Publicerad: publiceringsdatum
- Arkiverad: arkiveringsdatum
- Granskning: (inget datum)
```

### MCP Apps In Visual Studio Code

This server returns a requirement view app through
`ui://requirements/requirement-detail/{uniqueId}`. In Visual Studio Code, the
app can render directly in chat when the client supports MCP Apps.

If the app is not rendering:

1. Confirm the server is connected with `MCP: List Servers`.
2. Restart the server from that command if needed.
3. Enable the `chat.mcp.apps.enabled` setting if your VS Code build still
   requires it.

### Useful VS Code Commands

- `MCP: List Servers`
  Start, stop, restart, or inspect the server.
- `MCP: Browse Resources`
  Browse resources exposed by the server.
- `MCP: Reset Cached Tools`
  Refresh the tool list after server changes.

### Troubleshooting In VS Code

- If the server fails to start, open `MCP: List Servers`, select
  `requirement-management`, then choose `Show Output`.
- If the tools do not appear in chat, verify that the chat is in `Agent` mode
  and that the tools are enabled in `Configure Tools`.
- If the requirement app does not appear, the tool result still includes normal
  text and structured data, so the server remains usable even without app
  rendering.
- If VS Code logs repeated messages such as
  `Error connecting to http://localhost:3000/api/mcp for async notifications,
  will retry`, that is
  expected with the current stateless Streamable HTTP implementation. Tool
  calls, resources, and requirement app responses can still work correctly.
  Those messages refer to the optional async notification channel rather than
  normal MCP request/response handling.

## Configure GitHub Copilot Coding Agent

GitHub Copilot coding agent supports MCP tools, but not MCP resources or MCP
Apps. For this server, that means the tools are available, but the
HTML-based requirement view is ignored by the coding agent.

Because coding agent runs remotely, do not point it at
`http://localhost:3000/api/mcp`. Use a reachable HTTPS deployment instead.

Open your repository settings on GitHub:

1. `Settings`
2. `Copilot`
3. `Coding agent`
4. `MCP configuration`

Use a configuration like this:

```json
{
  "mcpServers": {
    "requirement-management": {
      "type": "http",
      "url": "https://your-domain.example/api/mcp",
      "tools": [
        "requirements_query_catalog",
        "requirements_get_requirement",
        "requirements_manage_requirement",
        "requirements_transition_requirement",
        "requirements_list_specifications",
        "requirements_get_specification_items",
        "requirements_add_to_specification",
        "requirements_remove_from_specification",
        "requirements_list_improvement_suggestions",
        "requirements_manage_improvement_suggestion",
        "requirements_generate_requirements"
      ]
    }
  }
}
```

This explicit allowlist is preferable to `"*"` because coding agent
can use the tools autonomously.

### Future Auth Example For Coding Agent

When the auth phase is enabled, configure headers with Copilot environment
variables or secrets prefixed with `COPILOT_MCP_`.

Example:

```json
{
  "mcpServers": {
    "requirement-management": {
      "type": "http",
      "url": "https://your-domain.example/api/mcp",
      "tools": [
        "requirements_query_catalog",
        "requirements_get_requirement",
        "requirements_manage_requirement",
        "requirements_transition_requirement",
        "requirements_list_specifications",
        "requirements_get_specification_items",
        "requirements_add_to_specification",
        "requirements_remove_from_specification",
        "requirements_list_improvement_suggestions",
        "requirements_manage_improvement_suggestion",
        "requirements_generate_requirements"
      ],
      "headers": {
        "Authorization":
          "$COPILOT_MCP_REQUIREMENT_MANAGEMENT_AUTHORIZATION"
      }
    }
  }
}
```

In that example, the Copilot environment secret value should already contain the
full header value, for example `Bearer <token>`.

## How To Work With The Tools Effectively

### 1. Start With Lookup Data

Before creating or transitioning requirements, ask the agent to fetch lookup
data first:

- areas
- categories
- types
- type categories
- statuses
- transitions

This is especially useful because transitions use `toStatusId`, and creation or
editing may require IDs for areas and classification fields.

For edits, also fetch the requirement immediately before preparing the edit
with `view: "history"`. Use `requirement.versions[0].id` as
`requirement.baseVersionId` and `requirement.versions[0].revisionToken` as
`requirement.baseRevisionToken`. If the server returns `409 Conflict` with
`reason: "stale_requirement_edit"`, read the returned latest snapshot and
compare before retrying.

### 2. Prefer `uniqueId`

Use stable IDs such as `INT0001` when possible. The server still supports
numeric IDs in some operations, but `uniqueId` is the preferred public
identifier.

### 3. Ask For The View You Need

`requirements_get_requirement` supports three views:

- `detail`
  Current requirement and latest published version context. If no published
  version exists, the server returns an error instead of falling back to draft,
  review, or archived versions.
- `history`
  All versions.
- `version`
  A specific version when used with `versionNumber`.

If you do not pass a `versionNumber`, the server does not default to the newest
draft or review version. It defaults to the published version with the highest
version number.

Examples:

```json
{
  "uniqueId": "INT0001",
  "view": "detail"
}
```

```json
{
  "uniqueId": "INT0001",
  "view": "history"
}
```

```json
{
  "uniqueId": "INT0001",
  "view": "version",
  "versionNumber": 2
}
```

### 4. Use `query_catalog` For Search And Pagination

The server combines requirement search and lookup catalog reads into the same
tool. For requirement lists, it supports:

- `limit`
- `offset`
- `uniqueIdSearch`
- `descriptionSearch`
- `includeArchived`
- `areaIds`
- `categoryIds`
- `typeIds`
- `qualityCharacteristicIds`
- `riskLevelIds`
- `normReferenceIds`
- `usageScenarioIds`
- `statuses`
- `requiresTesting`
- `sortBy`
- `sortDirection`

## Example Tasks

### Read-Only

- `List the first 10 requirements that mention login.`
- `Show the version history for SEC0012.`
- `List available requirement transitions.`
- `Show all scenarios and then tell me which ones are linked to INT0001.`

### Mutating

- `Create a draft requirement for area 3 describing MFA support.`
- `Edit INT0001 and add a reference to the new architecture decision record.`
- `Archive INT0001.`
- `Restore version 2 of INT0001.`
- `Transition INT0001 to published after checking the valid transitions.`

### Requirements Specifications

- `List all requirements specifications.`
- `List specifications whose name contains "säkerhet".`
- `Show all requirements in specification SAKLYFT-INFOR-Q2.`
- `Search for requirements about login in specification SAKLYFT-INFOR-Q2.`
- `Add requirements INT0001 and INT0002 to specification SAKLYFT-INFOR-Q2.`
- `Add requirement INT0005 to specification GDPR-FORV-2026 with needs reference text "Behov 4.1".` <!-- markdownlint-disable-line MD013 -->
- `Remove requirement INT0003 from specification SAKLYFT-INFOR-Q2.`

> **Note:** Specifications can be identified by `specificationId` (numeric) or
> `specificationSlug` (e.g. `SAKLYFT-INFOR-Q2`) — use whichever is available from
> `requirements_list_specifications`. `requirementIds` are numeric IDs; use
> `requirements_query_catalog` or `requirements_get_specification_items` to find
> them. Requirements must have a published version to be added to a specification.

## Limitations

- The server is HTTP-only in this project. There is no stdio transport.
- GitHub Copilot coding agent only uses tools from this server. It does not use
  the requirement resource or the requirement app view.
- Status transitions require numeric status IDs. Use the transitions or statuses
  catalogs instead of guessing them.

## Official Client References

- Visual Studio Code MCP setup:
  <https://code.visualstudio.com/docs/copilot/customization/mcp-servers>
- Visual Studio Code MCP configuration reference:
  <https://code.visualstudio.com/docs/copilot/reference/mcp-configuration>
- Visual Studio Code tool usage:
  <https://code.visualstudio.com/docs/copilot/agents/agent-tools>
- GitHub Copilot coding agent MCP integration:
  <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp>
- GitHub Copilot coding agent MCP capabilities:
  <https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent>
