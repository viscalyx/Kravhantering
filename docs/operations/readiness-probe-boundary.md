# Readiness Probe Boundary

`/api/ready` is a management probe, not a public application endpoint. The
production Nginx edge admits it only from explicitly configured probe networks.
The normal ingress firewall still controls who can reach HTTPS; this
path-specific boundary independently controls which admitted clients may run
readiness checks.

`/api/health` remains the public, dependency-free liveness check. Do not replace
it with readiness for process supervision.

## Prepare before installation or upgrade

Create a separate probe-boundary file before rendering or installing any
production topology. Use the actual IPv4 and IPv6 source networks from which
Nginx receives monitoring traffic. For `app-node-http`, these are the canonical
client addresses resolved through the separately configured trusted-proxy
chain. For direct TLS topologies, these are the connection peers seen by
Nginx.

The file accepts blank lines, comments, and exactly one `allow <CIDR>;`
directive per entry:

```nginx
# Monitoring nodes
allow 192.0.2.40/32;
allow 2001:db8:40::25/128;
```

Host routes (`/32` and `/128`) and bounded networks are valid. Hostnames,
additional Nginx directives, and unrestricted IPv4 or IPv6 `/0` networks are
invalid. Rendering fails when the file is missing, unreadable, symbolic-linked,
empty, or malformed; there is no permissive default.

Install the file and set its path in `release.env`:

```bash
sudo install -o root -g kravhantering -m 0644 \
  nginx-readiness-probes.conf \
  /etc/kravhantering/nginx-readiness-probes.conf
sudo chcon -t container_file_t \
  /etc/kravhantering/nginx-readiness-probes.conf
```

```dotenv
NGINX_READINESS_PROBE_CONFIG_FILE=/etc/kravhantering/nginx-readiness-probes.conf
```

Keep firewall ingress and this file aligned, but do not use a broad firewall
network as a substitute for identifying the monitoring sources.

## Runtime contract

An allowed `GET` returns only `{"status":"ready"}` with HTTP 200 or
`{"status":"not_ready"}` with HTTP 503. `HEAD` returns the same status and
headers without a body. Other allowed methods return HTTP 405 without reaching
the application. A source outside the boundary receives an empty HTTP 403 for
every method, with `Cache-Control: no-store` and no authentication challenge.

The edge permits one request per second per canonical client address with an
immediate burst of five. Excess requests return HTTP 503,
`Retry-After: 1`, `Cache-Control: no-store`, and the generic not-ready body
without reaching the application.

Each application process coalesces concurrent readiness requests and caches
the completed ready or not-ready result for five seconds. The internal cache
does not change the response `Cache-Control: no-store` policy. Fresh failures
produce one sanitized operator warning with fixed check, reason, diagnostic,
request, and correlation identifiers. Dependency names and reasons never
appear in the response.

## Roll out and verify

Render or install the selected topology only after the boundary file exists.
Restart Nginx through the normal topology target, then test from both an allowed
monitoring source and a source outside the configured networks.

From an allowed source:

```bash
curl --fail --silent --show-error \
  https://kravhantering.example.internal/api/ready
curl --head --silent --show-error \
  https://kravhantering.example.internal/api/ready
```

Confirm the JSON/status contract, `Cache-Control: no-store`, and an empty HEAD
body. From a denied source, confirm every tested method returns an empty 403,
has no `WWW-Authenticate` header, and creates no application readiness log.
Send a short burst from an allowed test source and confirm excess requests have
the documented 503 and `Retry-After` response while ordinary application and
`/api/health` traffic remain unchanged.

Record the boundary networks, verification sources, response statuses, and
rollout time in the change ticket. If monitoring cannot reach readiness after
rollout, keep liveness and normal traffic available, correct the probe file,
reinstall the topology, and repeat verification. Do not widen the boundary to
`/0` as a recovery measure.
