# MCP Server User Guide

## Overview

This project exposes a requirements-management MCP server named
`kravhantering-mcp-server`.

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

- `kravhantering_query_catalog`
  List or search requirements and fetch lookup catalogs such as areas,
  categories, types, type categories, statuses, scenarios, and transitions.
- `kravhantering_get_requirement`
  Fetch the current requirement detail, a specific version, or full version
  history.
- `kravhantering_manage_requirement`
  Create, edit, archive, delete the latest draft, or restore a historical
  version.
- `kravhantering_transition_requirement`
  Move a requirement through the lifecycle using a target status ID.

### Resources

- `requirements://requirement/{uniqueId}`
  Read-only JSON resource for a requirement.
- `ui://kravhantering/requirement-detail/{uniqueId}`
  Read-only HTML view for MCP Apps-capable clients.

Add `?version=<number>` to either URI to target a specific version.

## Current Security Status

As of March 8, 2026, the MCP route is designed for future authentication and
authorization, but the in-route auth phase has not been enabled yet.

If you expose `/api/mcp` outside local development before that phase lands,
protect it at the platform edge. The planned auth rollout is documented in
[TODO-mcp-server-auth-plan.md](./TODO-mcp-server-auth-plan.md).

## Run It Locally

1. Install dependencies with `npm install`.
2. Prepare the local D1 database with `npm run db:setup`.
3. Start the app with `npm run dev`.
4. Connect your MCP client to `http://localhost:3000/api/mcp`.

The server is implemented inside the Next.js app, so there is no separate MCP
process to start.

## Configure Visual Studio Code

Visual Studio Code supports MCP server configuration in `.vscode/mcp.json` for
workspace-scoped usage or in the user profile for global usage.

Create `.vscode/mcp.json` with:

```json
{
  "servers": {
    "kravhantering": {
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
    "kravhantering": {
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
4. Enable the `kravhantering` server or individual tools from it.
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
- `Use #kravhantering_query_catalog to list available statuses first, then move`
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
`ui://kravhantering/requirement-detail/{uniqueId}`. In Visual Studio Code, the
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
  `kravhantering`, then choose `Show Output`.
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
Apps. For this server, that means the four tools are available, but the
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
    "kravhantering": {
      "type": "http",
      "url": "https://your-domain.example/api/mcp",
      "tools": [
        "kravhantering_query_catalog",
        "kravhantering_get_requirement",
        "kravhantering_manage_requirement",
        "kravhantering_transition_requirement"
      ]
    }
  }
}
```

This explicit allowlist is preferable to `"*"` because coding agent can use the
tools autonomously.

### Future Auth Example For Coding Agent

When the auth phase is enabled, configure headers with Copilot environment
variables or secrets prefixed with `COPILOT_MCP_`.

Example:

```json
{
  "mcpServers": {
    "kravhantering": {
      "type": "http",
      "url": "https://your-domain.example/api/mcp",
      "tools": [
        "kravhantering_query_catalog",
        "kravhantering_get_requirement",
        "kravhantering_manage_requirement",
        "kravhantering_transition_requirement"
      ],
      "headers": {
        "Authorization": "$COPILOT_MCP_KRAVHANTERING_AUTHORIZATION"
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

### 2. Prefer `uniqueId`

Use stable IDs such as `INT0001` when possible. The server still supports
numeric IDs in some operations, but `uniqueId` is the preferred public
identifier.

### 3. Ask For The View You Need

`kravhantering_get_requirement` supports three views:

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
- `statuses`
- `requiresTesting`

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
