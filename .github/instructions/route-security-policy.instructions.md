---
applyTo: "{app/api/**/route.ts,lib/http/*.ts,proxy.ts,openapi/requirements-api.yaml,tests/unit/rest-route-*.test.ts,lib/__tests__/*policy.test.ts}"
---

# REST Route Security Policy

## Registry Authority

- Register every explicit app-owned REST operation in
  `lib/http/route-security-policy.ts`.
- Keep `/api/mcp` outside the REST registry.
- Declare `auth`, `csrf`, `sensitivity`, `cache`, and `contract` without
  defaults.
- Use uppercase methods and canonical Next.js templates.
- Reject duplicate, ambiguous, catch-all, and noncanonical templates.

## Invariants

- Require `same-origin` CSRF for every registered mutation.
- Keep `POST /api/auth/logout` as the only `public` plus `same-origin`
  operation.
- Require `no-store` for every `sensitive` operation.
- Preserve existing cache behavior. Do not add public caching, `max-age`, or
  blanket `no-store`.
- Stop and report a sensitive operation missing cache protection instead of
  changing its behavior silently.

## Runtime

- Resolve policy from the request in `proxy.ts` and shared route wrappers.
- Keep auth before CSRF and preserve trailing-slash ordering.
- Derive `HEAD` from `GET` and `OPTIONS` from path policy without CSRF.
- Apply the conservative session, mutation-CSRF, sensitive, `no-store` policy
  to unknown REST operations.
- Use the most restrictive path response policy for unsupported methods.
- Wrap restrictive reads with `withRestResponsePolicy`.
- Keep mutations branded by `secureMutationRoute`; use
  `secureLogoutMutationRoute` only for logout.
- Do not declare transport policy in route-local response headers.

## Completeness

- Keep registry operations exactly equal to route filenames and exported HTTP
  methods.
- Keep `contract: openapi` entries synchronized with explicit OpenAPI
  `x-auth`, `x-csrf`, and `x-cache` declarations.
- Keep `contract: focused` operations outside OpenAPI.
- Verify wrappers through observable handler branding.
