# REST And MCP Share Requirements Service

Status: Accepted on 2026-06-05.

REST routes and MCP tools are peer interfaces over a shared
`RequirementsService` when their workflows overlap. Transport parsing,
response status, content type and interface-specific response shaping stay in
route handlers and MCP tool handlers, while authorization, logging, workflow
validation, high-risk audit events and shared business decisions live in the
service.

REST-only reference-data, taxonomy and Admin Center CRUD routes may stay direct
DAL until they become part of the MCP contract. When an MCP tool is added for
an existing REST workflow, the matching REST behavior moves behind
`RequirementsService` in the same change.

## Considered Options

- Duplicate REST and MCP business logic: rejected because requirement
  lifecycle, specification membership, suggestions and security decisions must
  stay consistent across human and AI-facing interfaces.
- Route every REST endpoint through `RequirementsService`: rejected because
  simple REST-only admin and lookup routes do not need the extra service
  boundary until they share behavior with MCP.
