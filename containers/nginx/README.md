# Nginx Container Contract

This directory owns the runtime contract for the nginx vendor container.
It defines the image lock and the static configuration mounted into the
upstream nginx image. It does not define a Compose service, certificates, or a
wrapper image.

The local container edge mounts `readiness-probes.conf` as its explicit
non-production readiness boundary. It admits loopback and private container
networks used by the stack. Production deployments must supply their own
validated site-specific boundary; see
`docs/operations/readiness-probe-boundary.md`.

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
- Replacing inbound forwarding evidence with the connection peer before
  proxying to the application.
- Logging the method and URI path without query strings, referrer data, or raw
  forwarded-header values.

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

`image.lock.json` pins the upstream image by tag, manifest digest and image ID.
Use a tag that names both the nginx release and Alpine minor version, such as
`1.31.6-alpine3.24`. This tag can still be rebuilt upstream. The Linux AMD64
manifest digest selects the exact reviewed image.

Container PR Smoke and Container Release derive the nginx pull reference from
this lock as `image:tag@sha256:digest`. The client-IP container tests use the
same reference. The local production-smoke debugger uses the vendor digests
from the downloaded run's stack lock, so an upstream rebuild does not change
the images used to reproduce that run.

A controlled update changes the tag, manifest digest and image ID together in
a pull request, including the direct-pull example in the release environment
template. The drift detector reports newer nginx or Alpine versions and
changed digests under the current tag. Detection does not advance the lock or
change images pulled by unrelated pull requests.

The normal update path is `.github/workflows/dependency-drift.yml`. It runs
weekly from `main` and can also be started manually with `workflow_dispatch`.
The detector opens or refreshes one dependency-drift issue per image lane.
Resolve the issue with the
[resolve-dependency-drift skill](../../.github/skills/resolve-dependency-drift/SKILL.md).
Update `tag`, `manifestDigest` and `imageId` together, and keep
the public direct-pull example in
`containers/production/env/release.env.template` aligned with the lock.
Let the normal pull request workflows, including Container PR Smoke, validate
the change before merging.

Use the manual path when selecting an exceptional tag, recovering a failed
automation run, or changing registry or pinning policy:

1. Choose the new official nginx tag with an explicit Alpine minor version.
   Avoid moving tags such as `stable-alpine` for release locks.
2. Resolve the current manifest digest and image ID from Docker Hub.
3. Update `tag`, `manifestDigest` and `imageId` together in
   `image.lock.json`.
4. Run `npm run container:stack-lock:check` after generating a stack lock to
   verify that the stack lock copies this vendor entry exactly.
5. Run `npm run check` and the relevant image tests. Container PR Smoke
   validates production assembly; use the
   [local smoke diagnostic workflow](../../docs/development/production-smoke-debug.md)
   when investigating a failed CI run. Keep development services undisturbed
   when running isolated image probes.

## Update Rules

- Keep nginx configuration file-based unless a later design decision changes
  that.
- Do not add `.env.nginx.example` while nginx has no env vars.
- Do not build a project-owned nginx wrapper image for normal configuration
  changes.
- Keep nginx limited to TLS termination, app proxying, and Keycloak forwarding.
