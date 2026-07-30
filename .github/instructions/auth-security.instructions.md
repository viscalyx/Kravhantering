---
applyTo: "{app/api/**/*.ts,app/**/*.tsx,components/**/*.tsx,lib/auth/**/*.ts,lib/http/api-fetch.ts,lib/requirements/auth.ts,proxy.ts,tests/**/*.{ts,tsx}}"
---

# Auth Security

## Server Auth And CSRF

- Follow `route-security-policy.instructions.md` for REST registry authority
  and transport-policy resolution.
- For cookie-authenticated REST mutations governed by the registry, use
  `assertSameOriginRequest(request)` for the declared `same-origin` CSRF check.
  Do not hand-roll `Origin`, `Referer`, or `X-Requested-With` logic.
- Do not apply browser CSRF checks to Bearer-authenticated `/api/mcp` requests;
  keep `/api/mcp` outside the REST registry.
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
