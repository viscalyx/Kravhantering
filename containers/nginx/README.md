# Nginx Container Contract

This directory owns the runtime contract for the nginx vendor container.
It defines the image lock and the static configuration mounted into the
upstream nginx image. It does not define a Compose service, certificates, or a
wrapper image.

## Owned Configuration

- The vendor image lock in `image.lock.json`.
- Static nginx configuration in `nginx.conf` and `conf.d/`.
- Documented mount points for certificates and site configuration.

nginx does not use env vars in the first version. Its configuration comes from
source-controlled files and mounted, short-lived TLS material.

## Runtime Contract

The nginx service is responsible only for:

- TLS termination for `https://kravhantering.test`.
- Reverse proxy traffic to the app container.
- Forwarding Keycloak traffic under `/auth`.

Expected mounted files:

- `containers/nginx/nginx.conf` mounted at `/etc/nginx/nginx.conf`.
- `containers/nginx/conf.d/` mounted at `/etc/nginx/conf.d/`.
- Server certificate chain mounted at
  `/etc/nginx/tls/kravhantering.test.crt`.
- Server private key mounted at `/etc/nginx/tls/kravhantering.test.key`.

The committed site config for `kravhantering.test` proxies:

- `/` to `http://app-runtime:3000`.
- `/auth/error` to `http://app-runtime:3000`.
- `/auth/` to `http://keycloak:8080/`.

The `/auth` path redirects to `/auth/` before proxying so Keycloak receives
consistent realm paths. `/auth/error` is an exact app-runtime exception for
OIDC callback failures; keep it before the broader `/auth/` Keycloak location.

Private keys and generated CA material must be short-lived runtime files and
must not be saved as artifacts.

## Sensitive Values

nginx has no env file in this phase. These mounted values are sensitive:

- Server private key.
- Local CA private key.
- Any generated certificate material that includes private keys.

## Image Lock Updates

`image.lock.json` pins the upstream image by tag and digest.

To update it manually:

1. Choose the new official nginx tag.
2. Resolve the current manifest digest from Docker Hub.
3. Update `tag` and `digest` together in `image.lock.json`.
4. Run `npm run container:stack-lock:check` after generating a stack lock to
   verify that the stack lock copies this vendor entry exactly.
5. Verify the updated image with the local release-smoke flow:
   `npm run container:release-smoke:up`,
   `npm run test:release-smoke`, and
   `npm run container:release-smoke:down`.

## Update Rules

- Keep nginx configuration file-based unless a later design decision changes
  that.
- Do not add `.env.nginx.example` while nginx has no env vars.
- Do not build a project-owned nginx wrapper image for normal configuration
  changes.
- Keep nginx limited to TLS termination, app proxying, and Keycloak forwarding.
