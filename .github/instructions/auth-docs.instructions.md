---
applyTo: "{app/api/auth/**/*.ts,app/api/mcp/route.ts,components/AuthMenu.tsx,lib/auth/**/*.ts,lib/mcp/http.ts,lib/requirements/auth.ts,middleware.ts,tests/support/oidc-mock.ts,dev/keycloak/realm-kravhantering-dev.json,docs/auth-how-it-works.md,docs/auth-developer-workflow.md}"
---

# Auth Docs

- Update `docs/auth-how-it-works.md` whenever a change affects:
  - login, callback, logout, session, or `/api/auth/me` behaviour
  - proxy auth gating, session rejection, or header stripping
  - `/api/mcp` bearer-token authentication
  - required claims, role parsing, HSA-id validation, session-cookie contents,
    token validation, or security audit events
  - deployed hosting expectations or the OIDC provider contract described there
- Update `docs/auth-developer-workflow.md` whenever a change affects:
  - local Keycloak setup
  - auth env vars
  - mock IdP or local test workflow
  - local troubleshooting or smoke-test steps
- Keep Mermaid diagrams in `docs/auth-how-it-works.md` aligned with the
  implemented flow.
- Keep deployed-provider wording generic unless the behaviour is explicitly
  local-Keycloak-specific.
- Do not leave auth behaviour changes documented only in work documents.
