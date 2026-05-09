---
applyTo: "{app/api/**/*.ts,app/**/*.tsx,components/**/*.tsx,lib/auth/**/*.ts,lib/http/api-fetch.ts,lib/requirements/auth.ts,middleware.ts,tests/**/*.{ts,tsx}}"
---

# Auth Security

## Server Auth And CSRF

- Preserve auth-before-CSRF ordering in `middleware.ts`: unauthenticated REST
  mutations return `401`; signed-in CSRF failures return `403`.
- Enforce CSRF for cookie-authenticated REST mutations: `POST`, `PUT`, `PATCH`,
  `DELETE`.
- Exclude `/api/mcp/**` from browser CSRF checks; it uses
  `Authorization: Bearer` JWT validation.
- Use `assertSameOriginRequest(request)` for CSRF checks. Do not hand-roll
  `Origin`, `Referer`, or `X-Requested-With` logic.
- Keep middleware-level CSRF enforcement for REST mutations. Route-level CSRF
  checks may remain as defense-in-depth.
- Preserve inbound stripping of `x-user-id` and `x-user-roles`; never derive
  actor identity from request headers.

## Client Mutations

- Use `apiFetch` for same-origin browser API mutations.
- Do not use bare `fetch` for browser `POST`, `PUT`, `PATCH`, or `DELETE`
  requests to same-origin app APIs.
- Do not remove or override `X-Requested-With: XMLHttpRequest` on browser
  mutations.

## Tests

- Add or update tests when changing auth gates, CSRF checks, session projection,
  spoofed-header handling, or audit redaction.
- Cover both rejection and success paths for auth/CSRF changes.
- Keep `/api/auth/me` tests asserting no raw tokens, codes, verifiers, `state`,
  or `nonce` are returned.
