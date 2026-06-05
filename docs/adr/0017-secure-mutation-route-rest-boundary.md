# Secure Mutation Route As REST Mutation Boundary

Status: Accepted on 2026-06-05.

Kravhantering routes app-owned mutating REST methods (`POST`, `PUT`, `PATCH`
and `DELETE`) through `secureMutationRoute`. The wrapper is the REST mutation
boundary for request context creation, same-origin and CSRF checks,
authenticated actor enforcement, route/body validation, declared authorization
policy, authorization-denial action logging and safe error shaping before route
handler work runs.

Every wrapped mutation declares one of the application policy shapes: `admin`,
`requirements` or `custom`. Logout uses the explicit
`secureLogoutMutationRoute` special case because it is an auth endpoint with
CSRF and audit needs but no business authorization policy.

`/api/mcp` remains the intentional exception. MCP uses Bearer JWT
authentication and JSON-RPC/MCP tool schemas instead of the REST mutation
wrapper, so MCP tool contracts and ADR 0006 govern its transport boundary.

## Considered Options

- Let each REST route implement authentication, CSRF, validation and audit
  itself: rejected because security order and denial evidence would drift.
- Route MCP through the REST mutation wrapper: rejected because MCP has a
  different authentication and schema contract.
- Allow unwrapped REST mutations with route-specific justification: rejected
  because exceptions would weaken the coverage invariant and make security
  review harder.
