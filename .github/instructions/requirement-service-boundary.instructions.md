---
applyTo: "{app/api/**/*.ts,lib/requirements/service*.ts,lib/mcp/server.ts}"
---

# Requirement Service Boundary

- Route REST workflows through `RequirementsService` when they match current
  MCP tools.
- Treat current MCP overlap as requirement catalog, detail, version,
  create, edit, archive, delete-draft, restore, reactivate, and transition
  workflows.
- Treat current MCP overlap as requirements-specification list, item list,
  add membership, and remove membership by requirement IDs.
- Treat current MCP overlap as improvement-suggestion list, create, edit,
  delete, request-review, revert-to-draft, resolve, and dismiss workflows.
- Treat AI generation as overlapping only when the REST contract matches the
  non-streaming MCP generation workflow.
- Keep simple taxonomy, reference-data, and admin CRUD routes direct-DAL
  unless adding a matching MCP workflow.
- Keep REST-only variants direct-DAL, or extend `RequirementsService` before
  routing them through it.
- When adding an MCP tool for an existing REST workflow, move matching REST
  behavior behind `RequirementsService` in the same change.
- Keep HTTP parsing, response status/content type, and REST-only shaping in
  route handlers.
- Keep authorization, logging, workflow validation, high-risk audit events,
  and shared business decisions in `RequirementsService`.
- Do not force streaming AI REST routes through `RequirementsService` unless
  the service supports streaming, images, and provider preferences.
