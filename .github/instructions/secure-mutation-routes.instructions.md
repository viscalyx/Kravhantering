---
applyTo: "{app/api/**/route.ts,lib/http/secure-mutation-route.ts,tests/unit/secure-mutation-route*.test.ts,docs/security-privacy/api-security.md,docs/integrations/auth-how-it-works.md,docs/informationssakerhetskrav-atgarder-app.md}"
---

# Secure Mutation Routes

## REST Mutation Standard

- Wrap every app-owned REST `POST`, `PUT`, `PATCH`, and `DELETE` route in
  `app/api/**/route.ts` with `secureMutationRoute`.
- Use `secureLogoutMutationRoute` only for `app/api/auth/logout/route.ts`.
- Keep `app/api/mcp/route.ts` as the only direct mutating export exception.
  MCP uses bearer-token JSON-RPC handling, not the REST wrapper.
- Do not add `export async function POST`, `PUT`, `PATCH`, or `DELETE` for a
  REST route.
- Do not add another exception unless the user explicitly asks for a documented
  security exception. Update `tests/unit/secure-mutation-route-coverage.test.ts`
  and `docs/security-privacy/api-security.md` in the same change.

## Policies

- Declare a `policy` for every `secureMutationRoute` call.
- Use `adminMutationPolicy` for Admin Center and reference-data mutations.
- Use `requirementsMutationPolicy` for requirement, specification,
  improvement-suggestion, deviation, and AI requirement-generation mutations.
- Use `customMutationPolicy` only when route-specific authorization is required,
  such as privacy self-export or assigned access-review reviewers.
- Do not introduce an allow-all policy, an omitted policy, or a no-op custom
  policy.
- Run provider calls, throttling, DAL writes, and service mutations only inside
  the wrapped handler after authorization.

## Handler Shape

- Use wrapper-provided `context`, `params`, `body`, and `request` in handlers.
- Validate route params with `paramsSchema`; validate JSON bodies with
  `bodySchema`.
- Do not re-create request context or re-read session state inside a wrapped
  route.
- Keep HTTP parsing, response status/content type, and REST-only shaping in the
  route layer.
- Do not move REST HTTP shaping into `RequirementsService`.

## Special Route Rules

- Preserve `Cache-Control: no-store` and audit redaction on privacy and access
  review mutation responses.
- Build admin privileged audit from the wrapper `context`, not separate session
  reads.
- Preserve the existing MCP bearer-token contract when editing
  `app/api/mcp/route.ts`; do not apply `secureMutationRoute` there.

## Tests

- Keep `tests/unit/secure-mutation-route.test.ts` covering auth, CSRF, param and
  body validation, policy denial, unexpected errors, success, and no work before
  auth or policy.
- Keep `tests/unit/secure-mutation-route-coverage.test.ts` enforcing wrapper
  usage for all mutating REST route exports and `/api/mcp` as the only direct
  export exception.
- Add or update focused route tests when changing a mutation policy, validation
  schema, audit behavior, response cache header, or error contract.
