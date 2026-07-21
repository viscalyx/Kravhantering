# Kong mTLS enforcement in the pinned DB-less topology

<!-- cSpell:words dbless dnsnames OpenResty servername -->

Research date: 21 July 2026

Question: What can the repository-pinned Kong Gateway 3.15.0.1 configuration
enforce, without organizational PKI or licensed capabilities, for downstream
application-client mTLS, upstream Kong-to-adapter mTLS, stable peer identity,
certificate loading and rotation, and network exposure?

## Decision-ready conclusion

The pinned Kong Gateway can support strict mTLS on both of its HSA lookup
connections without purchased certificates, organizational PKI, or a Kong
Enterprise license:

- On **App to Kong**, Kong can expose an HTTPS-only proxy listener, present a
  mounted server certificate, require a client certificate issued by the
  dedicated App-to-Kong CA, and reject every otherwise-valid certificate whose
  RFC 2253 subject DN is not the expected application identity. Kong supports
  injecting Nginx server directives and includes; Nginx supplies
  `ssl_client_certificate`, `ssl_verify_client`, `$ssl_client_s_dn`, and a
  server-level `if` plus `return` for this enforcement. [Kong Nginx directive
  injection][kong-nginx-directives] [Nginx client TLS][nginx-client-tls]
  [Nginx rewrite module][nginx-rewrite]
- On **Kong to adapter**, Kong can present a mounted global upstream client
  certificate and key, trust only the dedicated Kong-to-adapter CA, enable
  upstream certificate verification, and verify the adapter's DNS identity
  against the Gateway Service `host`. Kong documents the mounted
  `client_ssl_cert` and `client_ssl_cert_key` paths, and the pinned template
  supplies the Service host as `proxy_ssl_name`, which Nginx uses for both
  certificate-name verification and SNI. [Kong certificate configuration]
  [kong-certificates] [Nginx upstream TLS][nginx-upstream-tls]
- Kong's `service.tls_sans` field is available in the pinned release, but it
  adds acceptable DNS or URI SAN values **in addition to** the Service host. It
  broadens the accepted identity set; it is not a way to require both the host
  and another SAN. Keep the Service host equal to the one expected adapter DNS
  SAN, and add `tls_sans` only when an intentional alias must also be accepted.
  [Kong 3.10.0.6 changelog][kong-changelog]
- Kong's Mutual TLS Authentication plugin is DB-less compatible and can map a
  client certificate common name to a Consumer, but Kong marks it Enterprise
  only. It is therefore outside this effort's unlicensed capability set. The
  listener-wide Nginx enforcement above is the available no-license route.
  [Kong mTLS Auth plugin][kong-mtls-auth]

The result does not require a topology change while Kong remains a dedicated,
single-route HSA gateway. It does impose a design invariant: every route on the
same Kong proxy listener must require the same client CA and expected subject
DN. If Kong later serves callers with different identities or policies, the
design must use separate listeners or Kong instances, add a project-owned
identity-enforcement plugin, or acquire the licensed route-aware plugin.

## Repository and pinned-image facts

The repository pins
`kong/kong-gateway:3.15.0.1-20260708-ubuntu` by manifest digest and identifies
Kong as development and release-test support, not required production runtime.
[Pinned Kong image][repo-kong-lock] [Repository Kong contract][repo-kong-readme]

The current declarative service uses plain HTTP to the adapter and permits both
HTTP and HTTPS requests on the route. Both current Compose definitions bind the
proxy and Admin API listeners to all Kong container interfaces. They publish no
Kong port to the host, but every container attached to the shared Compose
network can reach those listeners. [Current Kong configuration]
[repo-kong-config] [Devcontainer topology][repo-dev-compose]
[Single-node demo topology][repo-demo-compose]

Inspection of the exact pinned OCI image confirms:

- the image reports Kong Gateway `3.15.0.1-enterprise-edition` and contains
  OpenResty 1.29.2.5 with the HTTP SSL module;
- its Service schema accepts `client_certificate`, `tls_verify`,
  `tls_verify_depth`, `ca_certificates`, and `tls_sans.dnsnames` or
  `tls_sans.uris` for HTTPS Services;
- its generated proxy template sets `proxy_ssl_name $upstream_host`; and
- an unlicensed DB-less node loads startup declarative configuration, but
  `POST /config` returns `403` with `Enterprise license missing or expired`.

The last behavior matches Kong's 3.15 change that makes the unlicensed Admin
API read-only. [Kong 3.15 changelog][kong-changelog]

These image checks are reproducible from the repository lock without using a
moving tag:

<!-- markdownlint-disable MD013 -->
```sh
IMAGE='docker.io/kong/kong-gateway@sha256:5ec9d4b98b9e89b5ca60bc87a982d6246b5d941479cecf254f0e3e8064b85411'
docker inspect "$IMAGE" --format '{{json .Config}}'
docker run --rm --entrypoint /bin/sh "$IMAGE" -c \
  "sed -n '1,150p' /usr/local/share/lua/5.1/kong/db/schema/entities/services.lua"
docker run --rm --entrypoint /bin/sh "$IMAGE" -c \
  "grep -n 'proxy_ssl_name' /usr/local/share/lua/5.1/kong/templates/nginx_kong.lua"
```
<!-- markdownlint-enable MD013 -->

## Downstream: App to Kong

### Chain validation and server identity

Kong's proxy listener accepts the `ssl` suffix. `ssl_cert` and `ssl_cert_key`
accept absolute file paths, so Kong can present a generated server leaf without
embedding its private key in source-controlled declarative configuration.
[Kong configuration reference][kong-configuration]

The listener can use the following mounted inputs:

- the Kong server leaf and key for the App-to-Kong trust domain;
- the App-to-Kong CA public certificate; and
- a source-controlled Nginx include containing the expected subject DN.

The relevant Compose environment contract is:

```yaml
KONG_PROXY_LISTEN: 0.0.0.0:8443 ssl
KONG_SSL_CERT: /run/app-kong-mtls/kong-server.crt
KONG_SSL_CERT_KEY: /run/app-kong-mtls/kong-server.key
KONG_NGINX_PROXY_SSL_CLIENT_CERTIFICATE: /run/app-kong-mtls/ca.crt
KONG_NGINX_PROXY_SSL_VERIFY_CLIENT: "on"
KONG_NGINX_PROXY_SSL_VERIFY_DEPTH: "2"
KONG_NGINX_PROXY_INCLUDE: /kong/includes/app-client-identity.conf
```

Kong converts each `KONG_NGINX_PROXY_<DIRECTIVE>` variable into that directive
inside the proxy `server` block. Nginx's `ssl_client_certificate` establishes
the client trust store and `ssl_verify_client on` requires a successfully
verified certificate. [Kong Nginx directive injection]
[kong-nginx-directives] [Nginx client TLS][nginx-client-tls]

For generated application client leaves whose subject contains only the stable
identity `CN=kravhantering-app`, the mounted include is:

```nginx
if ($ssl_client_s_dn != "CN=kravhantering-app") {
    return 403;
}
```

Nginx defines `$ssl_client_s_dn` as the established client certificate's
RFC 2253 subject DN. Its server-level `if` supports exact variable comparison,
and `return 403` terminates a mismatch. This uses a stable identity field, so a
replacement leaf keeps working when it is issued by the same dedicated CA with
the same subject. It does not pin a serial number or certificate fingerprint.
[Nginx client TLS][nginx-client-tls] [Nginx rewrite module][nginx-rewrite]

The route must change from `protocols: [http, https]` to HTTPS only. Plain HTTP
must not remain on another proxy port because Nginx client-certificate
authentication exists only after a TLS handshake.

### Scope limitation

The injected client trust and subject check live in Kong's proxy `server`
block, before route-specific logic. They therefore cover every route on that
listener. This is suitable for the current one-route Kong contract, but it is
not route-aware authentication. Kong's route-aware mTLS Auth plugin supplies
that richer behavior and Consumer mapping, but is Enterprise only.
[Repository Kong contract][repo-kong-readme]
[Kong mTLS Auth plugin][kong-mtls-auth]

## Upstream: Kong to adapter

The upstream Service should use HTTPS, enable certificate verification
explicitly, and retain the adapter's expected DNS identity as `host`:

```yaml
services:
  - name: hsa-person-lookup-adapter
    protocol: https
    host: hsa-person-lookup-adapter
    port: 8443
    tls_verify: true
    routes:
      - name: hsa-directory-person-lookup-rest
        protocols:
          - https
        paths:
          - /hsa/person-records/lookup
        methods:
          - POST
        strip_path: false
```

Because this Kong instance has one upstream trust domain, file-backed global
upstream TLS configuration avoids placing generated private material in
`kong.yml`:

```yaml
KONG_TLS_CERTIFICATE_VERIFY: "on"
KONG_CLIENT_SSL: "on"
KONG_CLIENT_SSL_CERT: /run/kong-adapter-mtls/kong-client.crt
KONG_CLIENT_SSL_CERT_KEY: /run/kong-adapter-mtls/kong-client.key
KONG_NGINX_PROXY_PROXY_SSL_TRUSTED_CERTIFICATE: /run/kong-adapter-mtls/ca.crt
```

Kong documents global mounted client-certificate paths and permits a Service to
override them with a `client_certificate` entity. It likewise supports either
a global upstream CA file or Service-specific CA Certificate entities. The
global `tls_certificate_verify` control defaults on in this release and prevents
a secure Service from disabling verification; keeping it explicit makes the
contract reviewable. [Kong certificate configuration][kong-certificates]
[Kong configuration reference][kong-configuration]

Kong's template uses the Service's upstream host as `proxy_ssl_name`. Nginx
defines that value as the name used to verify the proxied server certificate
and to send through SNI. A leaf with DNS SAN
`hsa-person-lookup-adapter`, issued by only the Kong-to-adapter CA, therefore
provides both chain validation and stable adapter identity. Do not add a second
`tls_sans` value unless accepting either name is intentional.
[Nginx upstream TLS][nginx-upstream-tls]
[Kong 3.10.0.6 changelog][kong-changelog]

The adapter must independently require the Kong client certificate, trust only
the Kong-to-adapter CA, and compare the expected Kong client subject or SAN.
Kong can present that certificate, but only the adapter can authorize the
identity on this connection.

## Certificate loading and rotation

All listener and global upstream leaf keys can be absolute mounted paths.
Generated CA public certificates can also be mounted paths. No CA signing key
is needed by Kong at runtime. [Kong configuration reference]
[kong-configuration]

For this unlicensed 3.15 image, the safe DB-less lifecycle is:

1. Provision all three trust domains before dependent services start.
2. Render or mount the complete declarative config and Nginx include.
3. Remove CA signing keys from runtime-visible volumes.
4. Start Kong with the mounted leaf keys and public CA certificates.
5. Rotate by generating replacement leaves, replacing the complete mounted
   material as one unit, and recreating Kong and the affected peer in dependency
   order.

Kong supports applying file and environment changes with `kong reload`, which
sends Nginx `HUP`, starts new workers with the new configuration, and drains old
workers. That can support an operational reload design, but Compose recreation
is simpler and deterministic for disposable dev, CI, demo, and release-smoke
environments. [Kong CLI reference][kong-cli]

Do not design rotation around `POST /config`. DB-less Kong normally supports
whole-config replacement through that endpoint, but Kong 3.15 makes the Admin
API read-only without a license, and the exact pinned image returns `403` for
the request. Startup configuration and container recreation remain available.
[Kong DB-less mode][kong-dbless] [Kong 3.15 changelog][kong-changelog]

## Listener and Admin API exposure

No current Kong ports are published to the host, which preserves the existing
external boundary. However, `0.0.0.0:8000` and `0.0.0.0:8001` expose the proxy
and unauthenticated Admin API to all peers on the shared Compose network, not
only to the intended caller. [Devcontainer topology][repo-dev-compose]
[Single-node demo topology][repo-demo-compose]

The hardened topology should:

- keep the mTLS proxy on `0.0.0.0:8443 ssl` only, without a published host port;
- set `KONG_ADMIN_LISTEN=off`, because DB-less startup configuration is the
  source of truth and the unlicensed Admin API cannot reload it; or bind it to
  `127.0.0.1:8001` if local diagnostics still require it;
- keep the existing `kong health` container health check, which does not require
  another service to call the Admin API; and
- change `devcontainer:kong:status` to execute `kong health` in the Kong
  container rather than call `http://kong:8001/status` from the app container.

Kong documents DB-less configuration as a complete in-memory state loaded from
a file, and the repository already uses `kong health` for Compose health.
[Kong DB-less mode][kong-dbless] [Devcontainer topology][repo-dev-compose]

Splitting the shared Compose network into App-to-Kong, Kong-to-adapter, and
adapter-to-HSA networks would reduce lateral reachability further, but strict
mTLS does not depend on that split. This remains a defense-in-depth topology
decision rather than a Kong capability blocker.

## Verification obligations for implementation

The implementation handoff should test at least these cases:

- App to Kong succeeds with the expected App leaf, CA, and Kong DNS SAN.
- App to Kong fails with no client certificate, a leaf from the wrong trust
  domain, a valid App-to-Kong leaf with the wrong subject DN, an expired leaf,
  and a wrong Kong server name.
- Kong to adapter succeeds with the expected Kong leaf, CA, and adapter DNS
  SAN.
- Kong to adapter fails with no Kong client certificate, a leaf from the wrong
  trust domain, a valid leaf with the wrong identity, an untrusted adapter
  server, and a wrong adapter server name.
- A leaf or private key from one connection cannot authenticate on either of
  the other two connection legs.
- No HTTP proxy listener or certificate-validation bypass remains.
- The Admin API is unreachable from peer containers, while container health
  remains observable.
- Recreating the certificate volume and stack produces a fresh working set and
  leaves no CA signing key mounted in runtime services.

## Sources

[kong-certificates]: https://developer.konghq.com/gateway/ssl-certificates/
[kong-changelog]: https://developer.konghq.com/gateway/changelog/
[kong-cli]: https://developer.konghq.com/gateway/cli/reference/#kong-reload
[kong-configuration]: https://developer.konghq.com/gateway/configuration/
[kong-dbless]: https://developer.konghq.com/gateway/db-less-mode/
[kong-mtls-auth]: https://developer.konghq.com/plugins/mtls-auth/
[kong-nginx-directives]: https://developer.konghq.com/gateway/nginx-directives/
[nginx-client-tls]: https://nginx.org/en/docs/http/ngx_http_ssl_module.html
[nginx-rewrite]: https://nginx.org/en/docs/http/ngx_http_rewrite_module.html
[nginx-upstream-tls]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_name
[repo-demo-compose]: ../../containers/production/compose/single-node-demo.compose.yml
[repo-dev-compose]: ../../.devcontainer/docker-compose.yml
[repo-kong-config]: ../../containers/kong/kong.yml
[repo-kong-lock]: ../../containers/kong/image.lock.json
[repo-kong-readme]: ../../containers/kong/README.md
