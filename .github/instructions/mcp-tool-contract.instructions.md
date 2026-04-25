---
applyTo: "{lib/mcp/**/*.ts,lib/requirements/**/*.ts,lib/dal/**/*.ts,app/api/**/*.ts,docs/mcp-server-*.md,tests/unit/mcp-http.test.ts}"
---

# MCP Tool Contract Upkeep

## When Changing Callable Behavior

- If logic changes what an MCP client must send, can receive, or should do
  next, update `lib/mcp/server.ts` in the same change.
- Keep tool `description`, `inputSchema`, `outputSchema`, and field
  `.describe(...)` text aligned with the handler/service behavior.
- State prerequisite tool calls and exact source/destination fields for values
  clients must echo, such as `requirements_get_requirement`
  `requirement.versions[0].id` to `requirement.baseVersionId`.
- Do not rely on user docs alone to teach MCP clients how to call a tool.
- Update `docs/mcp-server-user-guide.md`,
  `docs/mcp-server-contributor-guide.md`, and `tests/unit/mcp-http.test.ts`.
- For outward-facing MCP invariants, update the quality siblings described in
  `.github/instructions/quality-spec.instructions.md`.
