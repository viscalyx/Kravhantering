# Auth developer workflow

This document covers how authentication works in local development and in
tests. Production wiring is in [plan-auth.md](./plan-auth.md) (Phase 7).

## Modes

<!-- markdownlint-disable MD013 -->
| Mode | When | How |
| --- | --- | --- |
| `AUTH_ENABLED=true` (default) | Normal dev, CI, prod | Real OIDC flow against local Keycloak (dev) or PhenixID (deployed). |
| `AUTH_ENABLED=false` | Quick local exploration only | Bypasses login. Refused at boot when `NODE_ENV=production`. |
<!-- markdownlint-enable MD013 -->

`AUTH_ENABLED` defaults to `true` everywhere — secure-first. The only way to
disable auth is to set `AUTH_ENABLED=false` explicitly, and only outside
production. The legacy `x-user-id` / `x-user-roles` header path is honored
only when `AUTH_ENABLED=false`.

## Local IdP (Keycloak)

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
(token exchange, userinfo, JWKS), the devcontainer's `postStartCommand`
launches a `socat` forwarder that binds `127.0.0.1:8080` inside the
`app` container and forwards to `idp:8080`. This keeps the browser-
facing issuer (`http://localhost:8080/realms/kravhantering-dev`) and
the server-side fetch URL identical.

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

<!-- cSpell:ignore authorsteward -->
| Username | Role(s) |
| --- | --- |
| `alice.author` | `Author` |
| `rita.reviewer` | `Reviewer` |
| `steve.steward` | `Steward` |
| `sam.authorsteward` | `Author`, `Steward` |
| `ada.admin` | `Author`, `Reviewer`, `Steward`, `Admin` |
| `noah.noroles` | _(none — for negative testing)_ |

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

### Roles claim

The realm emits a `roles` claim as a JSON array of strings on both ID and
access tokens. Values are exactly `Author`, `Reviewer`, `Steward`,
`Admin` (the canonical names used throughout the app and for RBAC).

## Local env vars

Add the following to `.env.development.local` (or copy from `.env.example`):

```dotenv
AUTH_ENABLED=true
NEXT_PUBLIC_AUTH_ENABLED=true
AUTH_OIDC_ISSUER_URL=http://localhost:8080/realms/kravhantering-dev
AUTH_OIDC_CLIENT_ID=kravhantering-app
AUTH_OIDC_CLIENT_SECRET=dev-only-app-secret
AUTH_OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/
AUTH_SESSION_COOKIE_PASSWORD=replace-with-32-bytes-of-randomness-XXXXXXXXXX
```

Generate a fresh cookie password with `openssl rand -base64 48`.

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
  [plan-auth.md Phase 7](./plan-auth.md) for the full mapping.

### Master switches

<!-- markdownlint-disable MD013 -->
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_ENABLED` | yes (server) | `true` | Master switch read by the server (middleware, API routes, `lib/auth/*`). Explicit `false` is rejected at boot when `NODE_ENV=production` (fail-closed). When `false`, middleware passes through and the legacy `x-user-id` / `x-user-roles` header path is honored for back-compat. |
| `NEXT_PUBLIC_AUTH_ENABLED` | yes (client) | `true` | Browser-visible mirror of `AUTH_ENABLED`. Two variables exist because Next.js only inlines env vars whose names start with `NEXT_PUBLIC_` into the client bundle — non-prefixed vars (`AUTH_ENABLED`) are stripped from browser code for safety. The mirror lets `components/AuthMenu.tsx` decide statically whether to render Sign in / Sign out without a `/api/auth/me` round-trip on every page load. **Must match `AUTH_ENABLED`** — they are validated together at boot, and a mismatch (e.g. server-on / client-off) is rejected so the UI can never lie about whether auth is active. |
<!-- markdownlint-enable MD013 -->

### OIDC client (PhenixID / Keycloak)

These describe the relationship between the app (the OIDC Relying Party)
and the IdP. In dev they point at the local Keycloak realm; in deployed
envs at the per-env PhenixID tenant.

<!-- markdownlint-disable MD013 -->
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_OIDC_ISSUER_URL` | yes | _(none)_ | Issuer base URL. The app appends `/.well-known/openid-configuration` to discover the authorization, token, JWKS, and end-session endpoints. Must exactly match the `iss` claim the IdP emits — trailing slash matters. |
| `AUTH_OIDC_CLIENT_ID` | yes | `kravhantering-app` (dev) | Confidential web-client id registered in the IdP. In OpenShift this comes from the `kravhantering-auth` Secret (per-env, see Q2b in `plan-auth.md`). |
| `AUTH_OIDC_CLIENT_SECRET` | yes | _(none)_ | Web-client secret. **Secret**: never commit a real value, never log. Local dev uses the placeholder `dev-only-app-secret` baked into the Keycloak realm JSON. |
| `AUTH_OIDC_REDIRECT_URI` | yes | `http://localhost:3000/api/auth/callback` | Full callback URL, scheme + host + path. **Must be pre-registered in the IdP**; mismatches surface as `redirect_uri_mismatch` from PhenixID. Re-register on every OpenShift Route hostname change (blue/green cutover). |
| `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI` | yes | `http://localhost:3000/` | Where the IdP sends the browser after `end_session_endpoint`. Also pre-registered per env. |
| `AUTH_OIDC_SCOPES` | no | `openid profile email` | Space-separated. `openid` is mandatory; `profile` carries `name` / `given_name` / `family_name`; `email` carries `email` / `email_verified`. Add custom scopes if PhenixID requires them to release the `roles` claim. |
| `AUTH_OIDC_ROLES_CLAIM` | no | `roles` | Claim name the parser in [lib/auth/roles.ts](../lib/auth/roles.ts) reads. Override only if the IdP cannot emit `roles` (the prescribed contract — see "Required token claims" in `plan-auth.md`). |
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
| `session.accessTokenExpiresAt` | written in [app/api/auth/callback/route.ts](../app/api/auth/callback/route.ts) | `tokens.expiresIn()` from the IdP, falling back to `AUTH_SESSION_TTL_SECONDS` | Tracks when the cached access token expires so the app knows when to refresh. Not user-visible. |
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
| `ssoSessionIdleTimeout` | `28800` (8 h) | **Idle** SSO session timeout. Resets each time the app refreshes the access token. If the user is gone longer than this, the next silent re-auth via `/api/auth/login` requires a fresh password. |
| `ssoSessionMaxLifespan` | `28800` (8 h) | **Absolute** SSO session lifetime. Hard cap regardless of activity; after this the user must sign in again. |
| `accessTokenLifespan` (realm) | `1800` (30 min) | Access-token lifetime issued to the `kravhantering-app` web client. The app refreshes inside this window using the refresh token. |
| `access.token.lifespan` (`kravhantering-mcp` client) | `3600` (1 h) | Access-token lifetime for service-to-service MCP tokens. Validated by [lib/auth/mcp-token.ts](../lib/auth/mcp-token.ts). |
<!-- markdownlint-enable MD013 -->

**How they interact:**

- A user signs in → cookie valid 8 h, IdP SSO session valid 8 h
  (idle + max), access token valid 30 min.
- Active user: access token refreshes silently every 30 min, which also
  rolls the IdP idle timeout forward. The cookie's 8 h absolute
  lifetime is the binding limit.
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
| `AUTH_OIDC_ALLOW_INSECURE_ISSUER` | no | `false` | Opt-in escape hatch that lets the OIDC client accept an `http://` issuer when `NODE_ENV=production`. Required for `npm run start:prodlike`, which runs in production mode against the local Keycloak. **Never** set to `true` in a real deployment — the app logs a loud warning when this kicks in. |
<!-- markdownlint-enable MD013 -->

### Sensitive vs non-sensitive

For OpenShift, this is the split between Secret and ConfigMap:

- **Secret (`kravhantering-auth`)**: `AUTH_OIDC_CLIENT_ID`,
  `AUTH_OIDC_CLIENT_SECRET`, `AUTH_SESSION_COOKIE_PASSWORD`.
- **ConfigMap**: `AUTH_ENABLED`, `NEXT_PUBLIC_AUTH_ENABLED`,
  `AUTH_OIDC_ISSUER_URL`, `AUTH_OIDC_REDIRECT_URI`,
  `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI`, `AUTH_OIDC_SCOPES`,
  `AUTH_OIDC_ROLES_CLAIM`, `AUTH_OIDC_API_AUDIENCE`,
  `AUTH_SESSION_COOKIE_NAME`, `AUTH_SESSION_TTL_SECONDS`,
  `AUTH_TRUST_PROXY`.

`AUTH_OIDC_CLIENT_ID` is technically not secret (it's quoted in every
authorization request), but it's grouped with the secret because ops
hands the id and secret over together per env.

## Bypassing auth temporarily

For quick exploration on a low-resource machine that cannot run Keycloak:

```sh
npm run dev:noauth
```

This sets `AUTH_ENABLED=false` and `NEXT_PUBLIC_AUTH_ENABLED=false` for the
dev server only. Treat it as the exception, not the norm.

## Tests

Unit + integration tests use `tests/support/oidc-mock.ts`, which spins up
[`oidc-provider`](https://github.com/panva/node-oidc-provider) in-process on
a random port per worker. No Docker. Same `openid-client` code path as
Keycloak / PhenixID. Use `mockIdp.loginAs('Admin')` to pre-select the
identity that the next interaction will return.

## Inspecting tokens

After signing in via `http://localhost:3000/api/auth/login`, the session
cookie holds an encrypted projection of the validated claims (not the raw
token). To see what the IdP issued, use Keycloak's account console at
`http://localhost:8080/realms/kravhantering-dev/account` or hit the
discovery URL above and exchange a code manually.

## Pre-prod smoke test

Before any first cutover to a deployed environment, run a manual smoke
test against the real PhenixID dev realm. The in-process mock and
Keycloak both implement the spec but cannot surface PhenixID-specific
quirks (claim format, custom `acr_values`, end-session parameters, case
sensitivity in `iss`).
