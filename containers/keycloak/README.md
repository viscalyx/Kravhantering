# Keycloak Container Contract

This directory owns the runtime contract for the Keycloak vendor container.
It defines the runtime env contract, image lock, and production-like realm
import used by the container stack. It does not define a Compose service or a
wrapper image.

## Owned Configuration

- Keycloak runtime env vars.
- Public demo values in `.env.keycloak.demo.example`.
- The vendor image lock in `image.lock.json`.
- Production-like realm export in `realm-kravhantering-test.json`.

The stack must run the upstream Keycloak image directly. Do not add a wrapper
image unless a later design decision requires custom Keycloak runtime code.

## Environment Variables

Required values for the first production-like stack:

- `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` create the bootstrap admin
  user.
- `KC_HOSTNAME` must match the public issuer base under nginx, for example
  `https://kravhantering.test/auth`.
- `KC_HTTP_PORT` selects the internal HTTP port used behind nginx.
- `KC_PROXY_HEADERS` allows Keycloak to respect forwarded HTTPS headers.

Recommended values:

- `KC_HEALTH_ENABLED=true` exposes health endpoints for wait scripts.
- `KC_HTTP_ENABLED=true` allows HTTP inside the private container network
  while nginx terminates external TLS.

## Realm Import

`realm-kravhantering-test.json` is the source-controlled realm for the
container stack and is separate from
`dev/keycloak/realm-kravhantering-dev.json`.

It targets this public issuer URL through nginx:

```text
https://kravhantering.test/auth/realms/kravhantering-test
```

The realm contains:

- Confidential web client `kravhantering-app`, with redirect URI
  `https://kravhantering.test/api/auth/callback`.
- Service client `kravhantering-mcp`, with an audience mapper for
  `kravhantering-app` and `employeeHsaId=SE5560000001-mcp1`.
- Realm roles `Reviewer`, `Admin`, and `PrivacyOfficer`.
- Minimal release-smoke users `release-smoke-user` and
  `release-smoke-admin`.

Client secrets and smoke-user passwords in this file are public demo values
only. They are safe to commit for local demo and release-smoke wiring, but
unsafe for any exposed environment.

## Sensitive Values

These values are sensitive outside local demo and smoke-test contexts:

- `KEYCLOAK_ADMIN_PASSWORD`
- Realm client secrets in `realm-kravhantering-test.json`.
- Test user passwords in `realm-kravhantering-test.json`.

The example file contains public demo values only. Treat them as unsafe for
any exposed environment.

## Image Lock Updates

`image.lock.json` pins the upstream image by tag and digest.

To update it manually:

1. Choose the new upstream Keycloak tag.
2. Resolve the current manifest digest from Quay.
3. Update `tag` and `digest` together in `image.lock.json`.
4. In a later phase, run `scripts/containers/generate-stack-lock.mjs` to
   verify that the stack lock copies this vendor entry exactly.
5. Run the release smoke test when that flow exists.

## Update Rules

- Keep Keycloak-only env vars in this directory; do not introduce a shared
  env file for multiple containers.
- Use `.env.keycloak.local` for local secrets. It matches the existing
  `.env.*.local` Git ignore pattern.
- `realm-kravhantering-test.json` must target
  `https://kravhantering.test/auth/realms/kravhantering-test`.
- Do not reuse the dev realm for the release-smoke or PoC/demo container
  stack.
