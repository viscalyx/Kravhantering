# How Auth Works

This document explains the authentication and security-audit behavior verified
in the current codebase.

It is intentionally not a replacement for the more detailed workflow docs:

- For local Keycloak, integration-test CI dependency, test setup, and
  env-var reference, see
  [auth-developer-workflow.md](../development/auth-developer-workflow.md).
- For application role and permission decisions, see
  [behörigheter.md](../governance/behörigheter.md).
- For the production OIDC provider integration contract, see
  [oidc-identity-provider-integration.md](../integrations/oidc-identity-provider-integration.md).
- For HSA-id syntax, see [hsa-id.md](../reference/hsa-id.md).

## Reading guide

- **Implemented now** means the behavior is backed by the current code in
  `proxy.ts`, `app/api/auth/*`, `lib/auth/*`, `lib/mcp/http.ts`, and the
  auth-focused tests.

## Current auth architecture in the app

- [`proxy.ts`](../../proxy.ts) is the front door. Auth is always on, so it:
  allows public paths, redirects unauthenticated browser page requests to
  `/api/auth/login`, returns `401` for unauthenticated API requests, and
  requires a Bearer header to be present for `/api/mcp`.
- Browser sign-in uses two separate `iron-session` cookies:
  a short-lived login-state cookie from
  [`lib/auth/login-state.ts`](../../lib/auth/login-state.ts) and the main
  encrypted session cookie from
  [`lib/auth/session.ts`](../../lib/auth/session.ts).
- `/api/auth/login` and `/api/auth/callback` use
  [`openid-client`](https://github.com/panva/openid-client) for OIDC
  discovery, the authorization-code exchange, PKCE handling, and OIDC
  validation.
- `/api/auth/me` exposes only safe session fields to the UI. It never returns
  raw tokens, and expired browser sessions are reported as unauthenticated.
- `/api/auth/logout` destroys the local session and, when the discovered IdP
  advertises it, redirects through the IdP `end_session_endpoint`.
- `/api/mcp` uses Bearer JWTs instead of the browser session cookie. Token
  validation happens in [`lib/auth/mcp-token.ts`](../../lib/auth/mcp-token.ts).
- [`lib/auth/audit.ts`](../../lib/auth/audit.ts) emits one JSON security event
  per auth-relevant action.

### Browser login flow

<!-- markdownlint-disable MD013 -->
```mermaid
sequenceDiagram
    actor Browser
    participant Proxy as proxy.ts
    participant Login as /api/auth/login
    participant LoginState as login-state cookie
    participant IdP as OIDC Identity Provider<br/>(Keycloak in local dev)
    participant Callback as /api/auth/callback
    participant Session as main session cookie
    participant Audit as security-audit log

    Browser->>Proxy: GET /sv/... (no session)
    Proxy-->>Browser: 302 /api/auth/login?returnTo=/sv/...

    Browser->>Login: GET /api/auth/login?returnTo=...
    Login->>Login: Generate PKCE verifier/challenge, state, nonce
    Login->>LoginState: Save verifier, state, nonce,<br/>returnTo, issuedAt
    Login-->>Browser: 302 to IdP authorization endpoint

    Browser->>IdP: Authorization request with PKCE
    IdP-->>Browser: Login UI / SSO
    Browser->>IdP: Authenticate
    IdP-->>Browser: 302 /api/auth/callback?code=...&state=...

    Browser->>Callback: GET /api/auth/callback?code=...&state=...
    Callback->>LoginState: Load stored login-state cookie
    Callback->>IdP: authorizationCodeGrant(...):<br/>code + verifier + expected state/nonce
    IdP-->>Callback: ID token + access token metadata
    Callback->>Callback: openid-client validates OIDC response
    Callback->>Callback: App validates sub, given_name,<br/>family_name, employeeHsaId,<br/>and parses roles
    Callback->>Session: Save encrypted session cookie<br/>(idToken only if it fits)
    Callback->>Audit: auth.login.succeeded
    opt Roles changed since prior session
        Callback->>Audit: auth.roles.changed
    end
    Callback->>LoginState: Destroy login-state cookie
    Callback-->>Browser: 302 returnTo
```
<!-- markdownlint-enable MD013 -->

- The redirect into `/api/auth/login` is usually triggered by `proxy.ts`, not
  by the page itself.
- The login-state cookie is separate from the main session cookie and has a
  much shorter lifetime. Its only job is to carry the PKCE verifier, `state`,
  `nonce`, `returnTo`, and `issuedAt` across the IdP round-trip.
- If `/api/auth/callback` cannot read that login-state cookie, browser
  navigations are redirected to `/auth/error` instead of seeing raw JSON.
  JSON clients that explicitly ask for `application/json` still receive a
  structured error. The server log includes sanitized diagnostics for TLS,
  Secure-cookie handling, callback host configuration, and the stable
  `login_state_cookie_missing` code.
- Browser error redirects use the public origin from `AUTH_OIDC_REDIRECT_URI`,
  not the inbound request URL. This keeps failed callback paths from exposing
  internal bind hosts such as `0.0.0.0:3000` when standalone Next.js runs
  behind nginx or another reverse proxy.
- In [`app/api/auth/callback/route.ts`](../../app/api/auth/callback/route.ts),
  the callback URL is rebuilt from the configured public redirect URI before
  the code exchange. This avoids host/origin mismatches when Next.js is
  running behind a proxy or under a different bind address.
- After `openid-client` validates the OIDC response, app code still requires
  `sub`, `given_name`, `family_name`, and `employeeHsaId`. Missing or invalid
  claims fail the login.
- Browser-role parsing uses `AUTH_OIDC_ROLES_CLAIM` from
  [`lib/auth/config.ts`](../../lib/auth/config.ts), defaulting to `roles`.
- The stored session is intentionally small: `sub`, `hsaId`, name fields,
  verified email when available, roles, and `accessTokenExpiresAt`.
  The raw access token is not stored. The raw ID token is stored only when it
  fits within the cookie budget, because it is used only as an
  `id_token_hint` during logout.
- The main session cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and
  `Secure` in production.

### Session and logout flow

- [`components/AuthMenu.tsx`](../../components/AuthMenu.tsx) calls `/api/auth/me`
  once on mount to render the signed-in user and aborts that request if the
  menu unmounts before the response settles.
- [`components/AuthExpiryGuard.tsx`](../../components/AuthExpiryGuard.tsx) also
  calls `/api/auth/me` on mount. It warns signed-in users two minutes before
  `expiresAt`, lets them authenticate again immediately, and redirects through
  `/api/auth/login?returnTo=<current-path>` when the session expires.
- `/api/auth/me` returns:
  `sub`, `hsaId`, `givenName`, `familyName`, `name`, `email?`, `roles`, and
  `expiresAt`. It never returns the raw ID token or raw access token.
- `lib/http/api-fetch.ts` emits a browser auth-required event when same-origin
  API calls return `401`, so unexpected invalid-session responses use the same
  sign-in flow instead of leaving the user on a stale page.
- The sign-in link in `AuthMenu` points to
  `/api/auth/login?returnTo=<locale-prefixed-path>`.
- `POST /api/auth/logout` is the real logout operation. It:
  checks same-origin and `X-Requested-With`, records `auth.logout`,
  destroys the session cookie, discovers the IdP end-session URL when
  possible, and returns a redirect target for the caller.
- `AuthMenu` follows the redirect target only for successful logout responses.
  Failed logout attempts keep the user on the current page and show an inline
  alert.
- `GET /api/auth/logout` is intentionally non-destructive. It only redirects
  locally and does not clear the session.
- If a session cookie is present but past `accessTokenExpiresAt`,
  `proxy.ts` records `auth.session.expired` and treats the request as
  signed out. Invalid or unreadable cookies still record
  `auth.session.rejected`.

### MCP bearer-token flow

<!-- markdownlint-disable MD013 -->
```mermaid
sequenceDiagram
    actor Client
    participant Proxy as proxy.ts
    participant Route as /api/mcp
    participant Verify as verifyMcpBearerToken()
    participant JWKS as JWKS endpoint
    participant Audit as security-audit log
    participant Attach as attachVerifiedActor()
    participant Handler as MCP JSON-RPC handler

    Client->>Proxy: POST /api/mcp with Authorization Bearer JWT
    Proxy->>Proxy: Require Bearer header to be present
    Proxy->>Route: Forward request
    Route->>Verify: verifyMcpBearerToken(request)
    Verify->>JWKS: Fetch/cache signing keys via createRemoteJWKSet(...)
    JWKS-->>Verify: JWK set
    Verify->>Verify: jwtVerify(...): issuer + audience + clockTolerance
    Verify->>Verify: Extract sub, employeeHsaId,<br/>roles, optional scope
    Verify->>Audit: auth.mcp.token.accepted
    Verify-->>Route: Verified actor
    Route->>Attach: attachVerifiedActor(request, actor)
    Route->>Handler: Continue with JSON-RPC handling
    Handler-->>Client: JSON-RPC response

    alt Missing or invalid token
        Proxy-->>Client: JSON-RPC 401 if Authorization header is missing
        Verify->>Audit: auth.token.rejected
        Route-->>Client: JSON-RPC 401 + WWW-Authenticate: Bearer
    end
```
<!-- markdownlint-enable MD013 -->

- `proxy.ts` only checks that a Bearer token is present for `/api/mcp`.
  Cryptographic verification is done later in
  [`lib/auth/mcp-token.ts`](../../lib/auth/mcp-token.ts).
- Missing-header and invalid-token failures use a JSON-RPC error body so MCP
  clients receive the same response shape at both auth gates.
- `verifyMcpBearerToken()` uses OIDC discovery metadata to read the issuer's
  `jwks_uri` and caches the resulting `RemoteJWKSet`.
- JWT verification checks signature, issuer, audience, and a 30-second clock
  tolerance.
- The required MCP identity is `employeeHsaId`. Values must match the HSA-id
  syntax documented in [hsa-id.md](../reference/hsa-id.md). The configured local
  MCP service client emits `SE5560000001-mcp1`; a missing claim means the IdP
  realm must be reset or re-imported from the current realm JSON.
- The current MCP implementation reads `roles` and `scope` directly from the
  access token payload. On success it attaches a verified actor to the active
  `Request` before the requirements service builds its request context.

### Security controls and audit events

- Identity is derived only from the verified iron-session cookie (browser
  flow) or a verified `Authorization: Bearer` JWT (MCP flow). The app does
  not accept `x-user-id` or `x-user-roles` request headers as a stand-in
  for a logged-in user, and `proxy.ts` strips both headers from every
  inbound request before any handler runs so a caller cannot use them to
  impersonate a user.
- Cookie-authenticated mutating requests go through the same-origin check in
  [`lib/auth/csrf.ts`](../../lib/auth/csrf.ts). They must present a same-origin
  `Origin` or `Referer` and `X-Requested-With: XMLHttpRequest`.
  `lib/auth/csrf.ts` and `proxy.ts` compare only the URL origin
  (scheme + host + port) of `AUTH_OIDC_REDIRECT_URI`; path and query values are
  ignored. `X-Forwarded-Proto` and `X-Forwarded-Host` are ignored for this
  check.
  `proxy.ts` enforces this centrally for mutating REST API requests after
  authentication has succeeded, excluding `/api/mcp`, which uses Bearer-token
  auth. Route-level checks remain as defense-in-depth through
  `lib/http/secure-mutation-route.ts`: app-owned `POST`, `PUT`, `PATCH`, and
  `DELETE` REST routes build `RequestContext`, require an authenticated actor,
  validate params and JSON bodies, run a declared `admin`, `requirements`, or
  `custom` authorization policy, and only then call route-specific handler
  work. `/api/auth/logout` uses `secureLogoutMutationRoute` because logout is
  an auth endpoint with CSRF and audit but no business authorization policy.
  `/api/mcp` remains the documented exception because it is guarded by Bearer
  JWT verification and MCP tool schemas instead of the REST mutation wrapper.
- Page responses get a per-request CSP nonce from `proxy.ts`.
- Security audit events are emitted through
  [`lib/auth/audit.ts`](../../lib/auth/audit.ts). The current event set is:
  `auth.login.succeeded`, `auth.login.failed`, `auth.logout`,
  `auth.session.expired`, `auth.session.rejected`, `auth.token.rejected`,
  `auth.mcp.token.accepted`, `auth.roles.changed`,
  `auth.csrf.rejected`, `auth.authorization.denied`,
  `requirements.sensitive_mutation.succeeded`,
  `admin.privileged_action.succeeded`,
  `access_review.created`, `access_review.item_decided`,
  `access_review.cancelled`, `access_review.completed`,
  `access_review.exported`,
  `privacy.erasure.previewed`, `privacy.erasure.executed`,
  `privacy.data_subject_export.generated`.
- Audit events intentionally redact sensitive fields such as tokens, secrets,
  authorization codes, PKCE verifiers, `state`, and `nonce`. When a top-level
  detail key is redacted, the audit writer also emits a structured
  `detail-key-redacted` breadcrumb with the source event, actor source, and
  redacted key name.
- Privacy erasure and data subject access export security events are emitted to
  the platform security-log stream. Privacy erasure execution also writes a
  database action-log row for Admin review. Both include the handler
  identity, request id, grouped counts or delivery metadata, and a
  non-reversible target fingerprint. They must not include the raw target
  HSA-id in event detail. Retention or redaction of handler identity in
  external security logs is handled by the platform logging policy because
  removing it can reduce traceability.
- Privileged Admin Center taxonomy and status-catalog mutations emit
  `admin.privileged_action.succeeded` only after the mutation succeeds. The
  detail contains operation, resource type, optional resource id, item counts,
  edited field names, request source, session roles and privileged IdP roles;
  it does not log raw target names, e-mail addresses, HSA-id values, secrets or
  submitted values.

### Audit event stream

- Auth audit events are emitted as one JSON object per line through
  `console.info(...)` in [`lib/auth/audit.ts`](../../lib/auth/audit.ts), tagged
  with `channel: "security-audit"`.
- Each record contains:
  `ts`, `event`, `outcome`, `actor`, `request`, and optional `detail`.
- `actor` identifies the source (`oidc`, `mcp`, or `anonymous`) and may also
  include `sub`, `hsaId`, and `clientId`.
- `request` includes the HTTP method and path without query strings or
  fragments, and may also include `requestId`, `userAgent`, and a validated
  `ip` when those values were present on the incoming request. `ip` is derived
  from the first valid `X-Forwarded-For` candidate and should only be trusted
  when that header is controlled by the reverse proxy or ingress path.
- `detail` is optional and is redacted defensively so top-level fields such as
  tokens, secrets, authorization codes, PKCE verifiers, `state`, and `nonce`
  are not emitted. Redaction breadcrumbs use the same `security-audit` channel
  and carry `breadcrumb: "detail-key-redacted"` instead of an audit `event`.
- Requirements authorization denials and sensitive business mutations use the
  same stream. Their `detail` payloads carry stable identifiers, counts, and
  action names only; free-text requirement content, motivations, and suggestion
  text are not emitted.
- Application action-log rows in `action_audit_events` are separate from
  this stream. They are database records for successful app-owned mutations and
  authorization denials, include request/correlation IDs and optional validated
  client IP, and can be viewed by Admins at `/{locale}/admin/audit-log`.
- The audit writer is intentionally transport-free: it does not push directly
  to Kafka, a webhook, a SIEM, or a database. It writes structured events to
  the process log stream and does not buffer them in the app.
- To stream audit events to another system, configure your hosting platform's
  log pipeline to select records where `channel == "security-audit"` and
  forward them to the desired sink, for example a centralized log store, a
  SIEM, a message queue, or a dedicated audit pipeline.
- This routing can be done with whatever logging mechanism the platform
  already provides, such as a container log driver, a host or node log agent,
  a sidecar collector, or a managed platform log-forwarding service.
- Because the audit records are separate JSON lines with a stable channel tag,
  they can be split and forwarded independently from normal application logs.
