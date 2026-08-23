# Pinned Kong strict-mTLS capability revalidation

<!-- cSpell:words dbless OpenResty servername -->

Revalidation date: 23 August 2026

The currently locked, unlicensed DB-less Kong Gateway 3.15.0.2 image can
enforce the settled chain-plus-exact-identity contract. This result clears the
Foundation A stop gate in issue 884; later work must not weaken this profile.

## Immutable image under test

The probe reads `containers/kong/image.lock.json` and runs the exact manifest:

<!-- markdownlint-disable MD013 -->
```text
docker.io/kong/kong-gateway@sha256:a4eb1fece17f5289d844c499af41c9e5b24919ddda02a89bcdae63efe6e390b4
```
<!-- markdownlint-enable MD013 -->

The manifest contains image configuration digest
`sha256:a76bbb6001f058da7052fb7a8475e9e6e17cd75c4d15e306d9f7a0004e83038c`
and reports Kong Gateway 3.15.0.2.

## Reproducible behavioral evidence

Run the probe from the repository root with Docker and OpenSSL available:

```sh
node containers/kong/verify-pinned-mtls-capabilities.mjs
```

The probe creates temporary private trust domains, destroys them on exit, and
does not write private material to repository artifacts. It verifies these
behaviors against a running container:

- injected proxy-listener directives require an App certificate issued by the
  dedicated client CA;
- a client certificate issued by that CA but carrying a different RFC 2253
  subject receives `403`, proving exact identity authorization beyond chain
  trust;
- a request without a client certificate is rejected before proxying;
- the declarative Service accepts `tls_verify` and `tls_verify_depth`;
- generated Nginx configuration presents the Kong client certificate, uses
  only the mounted Adapter trust root, enables server-name verification, and
  derives the expected name from `$upstream_host`;
- an Adapter server issued by the trusted CA but carrying a different DNS SAN
  produces a bounded `502`, proving exact upstream DNS authorization;
- the correct Adapter server requires and receives Kong's client certificate;
  and
- the Admin API is bound to loopback and unlicensed `POST /config` returns
  `403`, so startup configuration and coordinated recreation remain the
  supported lifecycle.

The safe machine-readable result is committed in
`containers/kong/pinned-mtls-capability-evidence.json`. It contains image
identities and boolean or bounded status outcomes only. It contains no PEM,
private key, person data, or raw TLS-library diagnostics.

## Decision

The listener-wide Nginx rule remains suitable because this Kong instance has
one App caller identity. The unlicensed image does not add route-aware Consumer
mapping, and the Admin API cannot promote DB-less configuration. Complete
mounted generations plus coordinated container recreation therefore remain
required. A future need for multiple client identities on one listener must
reopen the topology decision rather than broaden this rule.
