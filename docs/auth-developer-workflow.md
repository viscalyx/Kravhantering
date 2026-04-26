# Auth developer workflow

This document covers how authentication works in local development and in
tests. For the runtime architecture, production target setup, and IdP
contract, see [auth-how-it-works.md](./auth-how-it-works.md).

## Auth is mandatory in every build target

Authentication is always on. Every request hits the OIDC flow against
the configured issuer (Keycloak in dev and the local-prod target — both
point at the local Keycloak at `http://localhost:8080` — and the real
OIDC provider in deployed environments). Identity is derived only from
the verified iron-session cookie (browser flow) or a verified
`Authorization: Bearer` JWT (MCP flow); the app no longer accepts
`x-user-id` / `x-user-roles` request headers as a stand-in for a
logged-in user, and `proxy.ts` strips both headers from every inbound
request before any handler runs.

If the dev server cannot reach the IdP, requests fail loudly instead of
falling back to an unauthenticated mode. Bring up Keycloak first with
`npm run idp:up` (or via the devcontainer compose).

## Local IdP (Keycloak)

<!-- cSpell:ignore socat -->

Both setups use the same Keycloak image (`quay.io/keycloak/keycloak:26.0`)
and import the realm config from `dev/keycloak/realm-kravhantering-dev.json`
on every start. The JSON file is the source of truth — changes made via
the admin UI on `http://localhost:8080` are NOT persisted across restarts.

Keycloak publishes one port:

- `http://localhost:8080` — used as the OIDC issuer URL by the app, by
  your browser during the login redirect chain, **and** by the admin
  console. Plain HTTP is fine because the `kravhantering-dev` realm
  sets `sslRequired: none`, and the `master` realm is patched to
  `sslRequired: NONE` on devcontainer start by
  [.devcontainer/start-keycloak-forwarder.sh](../.devcontainer/start-keycloak-forwarder.sh)
  (Keycloak's default `sslRequired: external` would refuse HTTP from
  non-loopback clients — the socat hop makes Keycloak see the request
  coming from the app container's docker IP, not loopback). Dev only.

`start-dev` does not enable HTTPS in Keycloak 26 unless you provide
certificates, which we don't ship. The relax-on-startup approach above
keeps the dev setup to a single port with no certificate friction.

Keycloak Admin UI console credentials default to `admin` / `admin`. Outside
the devcontainer they come from `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`
in your shell or root `.env`; inside the devcontainer they come from
`.devcontainer/.env`. They only protect the local console — never reuse
them.

Discovery URL once the container is up:
`http://localhost:8080/realms/kravhantering-dev/.well-known/openid-configuration`.

### Local development without devcontainers

Use the standalone `docker-compose.idp.yml` at the repo root. The app
runs on the host (e.g. via `npm run dev`) and reaches Keycloak through
the published port `8080:8080`.

```sh
npm run idp:up      # docker compose -f docker-compose.idp.yml up -d idp
npm run idp:down    # stop and remove the container
```

You're responsible for setting the `AUTH_*` env vars yourself — see
"Local env vars" below.

### Local development using devcontainers

The devcontainer compose files (`.devcontainer/docker-compose.yml` and
`.devcontainer/elevated/docker-compose.yml`) include the same Keycloak
service inline as `idp`, so attaching to the devcontainer brings up
Keycloak alongside SQL Server automatically. The `app` service has
`depends_on: idp { condition: service_started }` (not `service_healthy`)
because Keycloak takes ~30s to boot — OIDC discovery happens lazily on
first sign-in, so the devcontainer attach is not blocked.

Both port `3000` (Next.js) and port `8080` (Keycloak) are published to
the host by the compose file and additionally listed in
`forwardPorts` in `devcontainer.json`, so a host browser can reach
`http://localhost:3000` and follow the OIDC redirect chain through
`http://localhost:8080` even when the devcontainer is remote (Codespaces
or a remote SSH host).

Inside the `app` container, however, `localhost:8080` does **not** reach
Keycloak — Keycloak runs in the sibling `idp` container and is reachable
on the compose network only as `idp:8080`. Because the OIDC issuer URL
must be the same for the host browser and for Next.js server-side calls
(token exchange, user information, JWKS), the devcontainer's `postStartCommand`
launches a `socat` forwarder that binds `127.0.0.1:8080` inside the
`app` container and forwards to `idp:8080`. This keeps the browser-
facing issuer (`http://localhost:8080/realms/kravhantering-dev`) and
the server-side fetch URL identical.

<!-- cSpell:ignore ECONNREFUSED -->

If `npm run dev` ever fails with `ECONNREFUSED 127.0.0.1:8080` from
`/api/auth/*`, the forwarder is not running. Restart it with the
idempotent helper script:

```sh
bash .devcontainer/start-keycloak-forwarder.sh
```

The script logs to `/tmp/socat-keycloak.log` and exits quickly if the
forwarder is already running. If `socat` itself is missing (older
devcontainer image), rebuild the container ("Dev Containers: Rebuild
Container") so the updated `.devcontainer/Dockerfile` installs it.

If you want to bring Keycloak up explicitly without restarting the
devcontainer:

```sh
docker compose -f .devcontainer/docker-compose.yml up -d idp
```

### Seeded users

All accounts use the password `devpass` (clearly dev-only, do not reuse).

| Username | Role(s) | `employeeHsaId` |
| --- | --- | --- |
| `olle.areaowner` | _(none)_ | `SE2321000032-areaowner1` |
| `cora.coauthor` | _(none)_ | `SE2321000032-areaco1` |
| `petra.packageresp` | _(none)_ | `SE2321000032-pkgresp1` |
| `paul.pkgcoauthor` | _(none)_ | `SE2321000032-pkgco1` |
| `rita.reviewer` | `Reviewer` | `SE2321000032-reviewer1` |
| `ada.admin` | `Admin` | `SE2321000032-admin1` |
| `noah.noroles` | _(none — for negative testing)_ | `SE2321000032-noroles1` |

The realm JSON is imported only when the `idp` container starts **and
the realm does not already exist** in Keycloak's embedded H2 store. A
plain `docker compose restart` keeps the existing realm and silently
skips the re-import, so any edits to
`dev/keycloak/realm-kravhantering-dev.json` (adding, removing, renaming
users or changing their roles) won't show up. Recreate the container
from the **host** instead so it boots with a fresh in-memory database
and re-imports the JSON:

<!-- markdownlint-disable MD013 -->
```sh
docker compose -f .devcontainer/docker-compose.yml up -d --force-recreate idp
```
<!-- markdownlint-enable MD013 -->

If you're using the elevated devcontainer, point at that compose file
instead:

<!-- markdownlint-disable MD013 -->
```sh
docker compose -f .devcontainer/elevated/docker-compose.yml up -d --force-recreate idp
```
<!-- markdownlint-enable MD013 -->

Run this on macOS/Windows/Linux outside the devcontainer — the
devcontainer itself does not have access to the host Docker daemon.
The compose file does not mount a Keycloak data volume, so recreation
is non-destructive (the JSON is the source of truth). Wait ~30 s for
Keycloak to finish booting before signing in.

### Prodlike local client (`kravhantering-local`)

The realm ships a second confidential web client dedicated to the
`local-prod` build target / `npm run start:prodlike` (port `3001`),
separate from the `kravhantering-app` client used by `npm run dev` on
port `3000`. This lets you validate the prod build target against the
local Keycloak without needing a real OIDC provider.

Source of truth:
[`dev/keycloak/realm-kravhantering-dev.json`](../dev/keycloak/realm-kravhantering-dev.json)
(the `kravhantering-local` entry under `clients`).

<!-- markdownlint-disable MD013 -->
| Field | Value |
| --- | --- |
| `clientId` | `kravhantering-local` |
| `secret` | `local-kc-app-secret` (clearly dev-only — never reuse) |
| `publicClient` | `false` (confidential web client) |
| Redirect URIs | `http://localhost:3001/api/auth/callback`, `http://127.0.0.1:3001/api/auth/callback` |
| `webOrigins` | `http://localhost:3001`, `http://127.0.0.1:3001` |
| Post-logout redirect URIs | `http://localhost:3001/`, `http://127.0.0.1:3001/` |
| PKCE | S256 |
| Claim mappers | `roles` (realm-role array) and `employeeHsaId`, identical to `kravhantering-app` |
<!-- markdownlint-enable MD013 -->

The values are loaded from
[`.env.prodlike`](../.env.prodlike) by `npm run build:local-prod` and
`npm run start:prodlike`:

```dotenv
AUTH_OIDC_ISSUER_URL=http://localhost:8080/realms/kravhantering-dev
AUTH_OIDC_CLIENT_ID=kravhantering-local
AUTH_OIDC_CLIENT_SECRET=local-kc-app-secret
AUTH_OIDC_REDIRECT_URI=http://localhost:3001/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3001/
AUTH_OIDC_API_AUDIENCE=kravhantering-app
```

The matching build-target side lives in
[`lib/runtime/build-target.local-prod.ts`](../lib/runtime/build-target.local-prod.ts).
Like the dev client, the seeded users above (and the `Reviewer` /
`Admin` roles + `employeeHsaId` claim) work unchanged because both
clients live in the same realm and share the same protocol mappers.

### Roles claim

The realm emits a `roles` claim as a JSON array of strings on both ID and
access tokens. Values are exactly `Reviewer` and `Admin` (the canonical
names used throughout the app and for RBAC). Authoring rights are not
carried by the roles claim — they are assignment-driven via
`employeeHsaId`.

### `employeeHsaId` claim

The realm also emits an `employeeHsaId` claim on the ID token, access
token and userinfo response. The value is sourced from each user's
`hsaId` attribute (see the table above). Format rules (validated by
`lib/auth/hsa-id.ts`):

- Pattern: `/^SE\d{10}-[A-Za-z0-9]+$/u` — literal `SE`, 10 digits,
  `-`, then one or more ASCII letters/digits.
- Maximum length: 31 characters.
- Example: `SE2321000032-1003`.

Login is rejected with 401 when the claim is missing or fails this
check.

### MCP synthetic HSA-id

The `kravhantering-mcp` Keycloak client is configured with an
`oidc-hardcoded-claim` mapper that emits
`employeeHsaId = mcp-client:kravhantering-mcp` on the access token used
by the MCP service-account flow. Values that begin with `mcp-client:`
deliberately bypass the HSA-id format validator; assignment-based
authorization treats the literal string as the actor identity.

### No refresh tokens

Browser sessions intentionally do **not** carry a refresh token. When
the session expires, the user is bounced through `/api/auth/login` for
silent re-auth against the still-valid SSO session at the IdP. This
keeps the encrypted session cookie small and avoids long-lived tokens
on the client.

### CSRF: client `fetch` mutations

Cookie-authenticated mutating requests (`POST` / `PUT` / `PATCH` /
`DELETE`) must carry an `X-Requested-With: XMLHttpRequest` header and
present a same-origin `Origin` (or `Referer`). Client code uses the
`apiFetch` helper from `lib/http/api-fetch.ts`, which adds the header
automatically; never call bare `fetch()` for mutating same-origin
endpoints from the browser. See `lib/auth/csrf.ts` for the
server-side check.

## Local env vars

Add the following to `.env.development.local` (or copy from `.env.example`):

```dotenv
AUTH_OIDC_ISSUER_URL=http://localhost:8080/realms/kravhantering-dev
AUTH_OIDC_CLIENT_ID=kravhantering-app
AUTH_OIDC_CLIENT_SECRET=dev-only-app-secret
AUTH_OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/
AUTH_SESSION_COOKIE_PASSWORD=replace-with-32-bytes-of-randomness-XXXXXXXXXX
```

Generate a fresh cookie password with `openssl rand -base64 48`.

These values target the `dev` build target on port `3000`. For the
`local-prod` build target on port `3001` (`npm run start:prodlike`),
the values live in [`.env.prodlike`](../.env.prodlike) and point at
the dedicated `kravhantering-local` Keycloak client described in the
[Prodlike local client](#prodlike-local-client-kravhantering-local)
section above.

## Environment variable reference

All `AUTH_*` variables are read once at process start by
[lib/auth/config.ts](../lib/auth/config.ts) and frozen in an `authConfig`
singleton — runtime mutation has no effect. Per environment they come from
different sources:

- **Local dev**: `.env.development.local` (and the defaults shipped in
  `.env.example`).
- **CI / tests**: injected by the test harness (`tests/support/oidc-mock.ts`
  generates a per-worker issuer + client and writes the matching values).
- **OpenShift dev/test/prod**: split between a `kravhantering-auth` Secret
  (anything sensitive) and a ConfigMap (everything else). See
  [auth-how-it-works.md](./auth-how-it-works.md) for the committed production
  mapping.

### OIDC client (deployed OIDC provider / Keycloak)

These describe the relationship between the app (the OIDC Relying Party)
and the IdP. In dev they point at the local Keycloak realm; in deployed
envs at the per-env OIDC issuer and client registration.

<!-- markdownlint-disable MD013 -->
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_OIDC_ISSUER_URL` | yes | _(none)_ | Issuer base URL. The app appends `/.well-known/openid-configuration` to discover the authorization, token, JWKS, and end-session endpoints. Must exactly match the `iss` claim the IdP emits — trailing slash matters. |
| `AUTH_OIDC_CLIENT_ID` | yes | `kravhantering-app` (dev) | Confidential web-client id registered in the IdP. In OpenShift this comes from the `kravhantering-auth` Secret in the per-environment production setup. |
| `AUTH_OIDC_CLIENT_SECRET` | yes | _(none)_ | Web-client secret. **Secret**: never commit a real value, never log. Local dev uses the placeholder `dev-only-app-secret` baked into the Keycloak realm JSON. |
| `AUTH_OIDC_REDIRECT_URI` | yes | `http://localhost:3000/api/auth/callback` | Full callback URL, scheme + host + path. **Must be pre-registered in the IdP**; mismatches surface as `redirect_uri_mismatch` from the configured OIDC provider. Re-register on every OpenShift Route hostname change (blue/green cutover). |
| `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI` | yes | `http://localhost:3000/` | Where the IdP sends the browser after `end_session_endpoint`. Also pre-registered per env. |
| `AUTH_OIDC_SCOPES` | no | `openid profile email` | Space-separated. `openid` is mandatory; `profile` carries `name` / `given_name` / `family_name`; `email` carries `email` / `email_verified`. Add custom scopes if your OIDC provider requires them to release the `roles` claim. |
| `AUTH_OIDC_ROLES_CLAIM` | no | `roles` | Claim name the parser in [lib/auth/roles.ts](../lib/auth/roles.ts) reads. Override only if the IdP cannot emit `roles` and the committed auth contract has been updated accordingly. |
| `AUTH_OIDC_API_AUDIENCE` | no | falls back to `AUTH_OIDC_CLIENT_ID` | Audience expected on **access tokens** validated by the MCP path ([lib/auth/mcp-token.ts](../lib/auth/mcp-token.ts)). Set explicitly when the MCP client receives tokens scoped to a different `aud` than the web client. |
<!-- markdownlint-enable MD013 -->

### Session cookie (`iron-session`)

The app keeps no server-side session store; everything is in a signed,
encrypted cookie. These variables govern the cookie's identity and
lifetime.

<!-- markdownlint-disable MD013 -->
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_SESSION_COOKIE_PASSWORD` | yes | _(none)_ | Encryption + signing key for the session cookie. **Must be ≥ 32 characters.** Generate with `openssl rand -base64 48`. **Secret**: per env, lives in the OpenShift Secret. Rotating invalidates every live session — schedule during low traffic. |
| `AUTH_SESSION_COOKIE_NAME` | no | `kravhantering_session` | Cookie name. Override only if you need to coexist with another deployment on the same host. |
| `AUTH_SESSION_TTL_SECONDS` | no | `28800` (8 h) | Session lifetime. After expiry the next request bounces through `/api/auth/login` (silent if the IdP SSO session is still alive). |
<!-- markdownlint-enable MD013 -->

### Session and token timeouts

Two systems control how long a sign-in stays valid: this app (cookie
lifetime) and the IdP (SSO session + token lifespans). They are
independent — the shortest one wins.

**App side (this repo):**

<!-- markdownlint-disable MD013 -->
| Knob | Where | Default | Meaning |
| --- | --- | --- | --- |
| `AUTH_SESSION_TTL_SECONDS` | env → [lib/auth/config.ts](../lib/auth/config.ts), [lib/auth/session.ts](../lib/auth/session.ts) | `28800` (8 h) | Absolute lifetime of the encrypted `iron-session` cookie. **Does not slide on activity.** When the cookie expires, the next request hits `/api/auth/login` and is silently re-authenticated if the IdP SSO session is still alive; otherwise the user sees the IdP login page. |
| `session.accessTokenExpiresAt` | written in [app/api/auth/callback/route.ts](../app/api/auth/callback/route.ts) | `tokens.expiresIn()` from the IdP, falling back to `AUTH_SESSION_TTL_SECONDS` | Tracks when the cached access token expires so the app knows when to re-auth. Not user-visible. |
<!-- markdownlint-enable MD013 -->

The app does **not** implement an idle/inactivity timeout. There is no
sliding renewal on the cookie, no "logged out after N minutes idle"
banner, and no server-side session store to expire.

**IdP side (Keycloak realm `kravhantering-dev`):**

Defaults come from [dev/keycloak/realm-kravhantering-dev.json](../dev/keycloak/realm-kravhantering-dev.json).
Production values are set per environment by ops on the real IdP.

<!-- markdownlint-disable MD013 -->
| Setting | Default (dev) | Meaning |
| --- | --- | --- |
| `ssoSessionIdleTimeout` | `28800` (8 h) | **Idle** SSO session timeout. If the user is gone longer than this, the next silent re-auth via `/api/auth/login` requires a fresh password. |
| `ssoSessionMaxLifespan` | `28800` (8 h) | **Absolute** SSO session lifetime. Hard cap regardless of activity; after this the user must sign in again. |
| `accessTokenLifespan` (realm) | `1800` (30 min) | Access-token lifetime issued to the `kravhantering-app` web client. The app does **not** refresh access tokens client-side; on cookie expiry it re-bounces through `/api/auth/login`. |
| `access.token.lifespan` (`kravhantering-mcp` client) | `3600` (1 h) | Access-token lifetime for service-to-service MCP tokens. Validated by [lib/auth/mcp-token.ts](../lib/auth/mcp-token.ts). |
<!-- markdownlint-enable MD013 -->

**How they interact:**

- A user signs in → cookie valid 8 h, IdP SSO session valid 8 h
  (idle + max), access token valid 30 min.
- Active user: when the cookie's 8 h absolute lifetime expires the next
  request bounces through `/api/auth/login`, which silently re-auths
  against the still-valid SSO session at the IdP and writes a fresh
  cookie. There is no in-process refresh-token round-trip.
- Idle user past 8 h: cookie has expired and IdP SSO session has
  expired → full IdP login on next request.
- To enforce a shorter inactivity window (e.g. 30 min idle), lower
  `ssoSessionIdleTimeout` on the IdP and lower
  `AUTH_SESSION_TTL_SECONDS` to a comparable value. There is no
  app-level idle timer to configure.

### Reverse-proxy trust

<!-- markdownlint-disable MD013 -->
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_TRUST_PROXY` | no | `true` | When `true`, the app honours `X-Forwarded-Proto` / `X-Forwarded-Host` so generated redirect URIs use `https://<route-host>` instead of the in-pod scheme/host. Required behind the OpenShift Route. Set `false` only if exposing the pod directly without a proxy (rare). |
| `AUTH_OIDC_ALLOW_INSECURE_ISSUER` | no | `false` | Build-target constant (not a runtime env var). Both the `dev` and `local-prod` build targets set it to `true` so the local Keycloak on `http://localhost:8080` works; the `prod` build target hard-codes it to `false`. |
<!-- markdownlint-enable MD013 -->

### Sensitive vs non-sensitive

For OpenShift, this is the split between Secret and ConfigMap:

- **Secret (`kravhantering-auth`)**: `AUTH_OIDC_CLIENT_ID`,
  `AUTH_OIDC_CLIENT_SECRET`, `AUTH_SESSION_COOKIE_PASSWORD`.
- **ConfigMap**: `AUTH_OIDC_ISSUER_URL`, `AUTH_OIDC_REDIRECT_URI`,
  `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI`, `AUTH_OIDC_SCOPES`,
  `AUTH_OIDC_ROLES_CLAIM`, `AUTH_OIDC_API_AUDIENCE`,
  `AUTH_SESSION_COOKIE_NAME`, `AUTH_SESSION_TTL_SECONDS`,
  `AUTH_TRUST_PROXY`.

`AUTH_OIDC_CLIENT_ID` is technically not secret (it's quoted in every
authorization request), but it's grouped with the secret because ops
hands the id and secret over together per env.

## Tests

Unit tests stub the resolved actor at the request boundary via
`attachVerifiedActor()` (see `lib/requirements/auth.ts`); no OIDC round
trip required. Auth-flow specifics (config validation, session helpers,
callback / logout audit, MCP bearer verification, proxy enforcement) are
exercised by the dedicated unit tests in `tests/unit/auth-*.test.ts`.

Playwright integration tests run against the real Keycloak. The shared
`tests/integration/global-setup.ts` performs one HTTP login per role and
stores the resulting iron-session cookie under `test-results/auth/<role>.json`.
Every spec then loads that storageState by default (configured in
`playwright.config.ts` and `playwright.prodlike.config.ts`). The dedicated
`tests/integration/auth-login.spec.ts` exercises the full redirect chain
without the storageState fixture.

When `PLAYWRIGHT_SKIP_WEBSERVER` is set (Playwright will not boot a web
server, you point the suite at an already-running app), `globalSetup`
skips the Keycloak login entirely and reuses the cached cookies in
`test-results/auth/<role>.json`. If any role file is missing it fails
fast with an explicit message naming the missing file(s); seed the
cache by running Playwright once normally first (so `globalSetup` can
log in against the local IdP via `npm run idp:up`) and then re-run with
`PLAYWRIGHT_SKIP_WEBSERVER=1`.

## Inspecting tokens

After signing in via `http://localhost:3000/api/auth/login`, the session
cookie holds an encrypted projection of the validated claims (not the raw
token). To see what the IdP issued, use Keycloak's account console at
`http://localhost:8080/realms/kravhantering-dev/account` or hit the
discovery URL above and exchange a code manually.

## Tailing the security audit stream

Auth-related security events (`auth.login.succeeded`, `auth.login.failed`,
`auth.logout`, `auth.session.rejected`, `auth.token.rejected`,
`auth.mcp.token.accepted`, `auth.roles.changed`, `auth.csrf.rejected`)
are emitted as single-line JSON to `console.info` and tagged with
`"channel":"security-audit"`. To watch them locally:

```bash
npm run dev | grep '"channel":"security-audit"' | jq .
```

Use `jq 'select(.event=="auth.login.failed")'` to filter by event, or
`select(.outcome=="failure")` to surface only rejections. Tokens, PKCE
verifiers, `state`, `nonce`, and `code` values are stripped before emit.

## Pre-prod smoke test

Before any first cutover to a deployed environment, run a manual smoke
test against the real deployed OIDC provider in a dev or pre-prod
environment. The in-process mock and Keycloak both implement the spec but
cannot surface provider-specific quirks (claim format, custom `acr_values`,
end-session parameters, case
sensitivity in `iss`).

1. Sign in interactively and complete the callback round-trip successfully.
   Confirm the browser lands on the expected post-login page without callback
   errors.
2. Call `/api/auth/me` with the signed-in session and verify the returned user
   data matches the expected claims.
   Check `sub`, `employeeHsaId`-derived fields, role claims, and any expected
   `acr_values` formatting from the deployed OIDC provider.
3. Open a protected page while signed out and verify the browser is redirected
   to the login flow, then back to the original page after authentication.
4. Call a protected API without a valid session and verify it returns `401`
   rather than HTML or a redirect payload.
5. Trigger logout and verify both the local session and the IdP session end as
   expected.
   Confirm the post-logout redirect lands on the configured return URL.
6. Exercise the MCP bearer-token flow end to end.
   Verify token issuance, issuer/audience values, and successful access to an
   MCP-protected endpoint with the issued token.
