# Access Logging and Client IP Trust

This guide defines the production Nginx access-log and client-address trust
boundary. Select the ingress topology before installing or upgrading the
Quadlet units.

## Access-log contract

The bundled Nginx logs the connection address, timestamp, method, normalized
URI path, protocol, status, response size, user agent, and upstream address.
It does not log query strings, referrers, raw `Forwarded` or
`X-Forwarded-*` values, or the private canonical client-address header.

This keeps OIDC callback `code` and `state` parameters, other query data, and
referrer query data out of new standard access records. Application security
events and action-log rows independently remove query strings from paths.

## Direct ingress

Use `app-node-tls` when an app node terminates public TLS, or `single-node` for
the self-contained TLS topology. These topologies trust only the connection
peer. Nginx overwrites inbound `X-Forwarded-For` and
`X-Kravhantering-Client-IP` values with that peer address before proxying to
the application.

Do not place another proxy in front of a direct-ingress topology when client
address attribution is required. Select `app-node-http` instead. Every proxy
route discards the RFC `Forwarded` header as untrusted forwarding evidence.

## Load-balanced ingress

Use `app-node-http` only behind a TLS-terminating load balancer or reverse
proxy. Restrict the host bind and firewall to approved proxy networks. The
topology fails before rendering unless `NGINX_TRUSTED_PROXY_CONFIG_FILE` names
an existing readable file that is not a symbolic link and has at least one
explicit CIDR.

Create the file as root. Use one directive per trusted network:

```nginx
set_real_ip_from 10.20.30.0/24;
set_real_ip_from 2001:db8:20:30::/64;
```

Use the actual source networks from which the app-node Nginx receives proxy
connections. Include every approved proxy hop that can be adjacent to Nginx
or appear at the trusted end of `X-Forwarded-For`. Do not use `0.0.0.0/0`,
`::/0`, client networks, or a broad internal network merely for convenience.
The load balancer must append its observations to `X-Forwarded-For`; it must
not accept a client-supplied chain as trusted evidence.

Install and label the configuration:

```bash
sudo install -o root -g kravhantering -m 0640 \
  nginx-trusted-proxies.conf \
  /etc/kravhantering/nginx-trusted-proxies.conf
sudo chcon -t container_file_t \
  /etc/kravhantering/nginx-trusted-proxies.conf
```

Set the matching path in `/etc/kravhantering/release.env`, then reinstall the
`app-node-http` topology. Nginx recursively walks the forwarded chain from the
trusted edge and selects the last address not covered by a configured trusted
network. It replaces the forwarded chain and sends the result to the
application as one `X-Kravhantering-Client-IP` value. The application ignores
raw forwarding headers and rejects lists or malformed canonical values.
Nginx also discards the raw RFC `Forwarded` header before proxying.

## Verification

After rollout, send a request containing a harmless query marker, referrer
query marker, spoofed forwarding chain, and spoofed canonical header. Confirm
that the access record contains only the path and resolved client address, and
that none of the markers or raw values appear. Exercise an action that creates
an action-log or security event and confirm its client IP matches the trusted
boundary. Repeat with the longest approved proxy path.

For `app-node-http`, also verify that a request arriving from outside every
configured trusted CIDR is recorded as its immediate peer and cannot promote
a prepended address. A failed check blocks rollout.

## Existing sensitive access logs

Access records created before this contract may contain OIDC callback
parameters, other query data, referrer query data, or attacker-controlled
forwarding values. Treat those records as sensitive security material:

1. Stop routine export and broad access to the affected log interval.
2. Identify every journal, aggregate, backup, support bundle, and SIEM copy.
3. Apply the approved incident, privacy, and retention process. Preserve only
   evidence required by that process, with query and referrer data redacted.
4. Remove or expire other copies through each platform's approved log-lifecycle
   mechanism. Do not copy old records into the new standard stream.
5. Rotate any credential that remains usable and record the containment and
   deletion decisions.

Do not shorten retention or delete evidence ad hoc. Coordinate the action with
the accountable security, privacy, and logging owners.
