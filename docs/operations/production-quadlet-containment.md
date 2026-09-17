# Production Quadlet Containment

This guide defines the supported containment contract for the production
services for operators configuring resource limits and qualifying a release.
It applies to the `app-node-tls`, `app-node-http`, and `single-node` topologies
in the deployment archive. SQL Server is present only in `single-node`.
Keycloak is included only when that topology uses a bundled identity provider;
production requires `IDENTITY_PROVIDER_MODE=external` or `hardened-bundled`.

## Host prerequisites

The published project Node runtimes use UBI 10 for Linux AMD64. The container
host must expose an **x86-64-v3** CPU, including when it is a virtual machine.
Check the VM CPU configuration as well as the physical processor before
installation or upgrade. Red Hat documents this hardware requirement in its
[container compatibility policy](https://access.redhat.com/support/policy/rhel-container-compatibility).
The supported production host remains RHEL 10; using UBI does not establish
Red Hat certification or support for the derived Kravhantering images.

Run the helper as the dedicated rootless service user before installing or
reinstalling units:

```bash
cd /opt/kravhantering/current
bin/kravhantering-quadlet.sh verify-host --topology app-node-tls
```

The check fails closed unless the host has cgroup v2, a working user systemd
manager, rootless Podman with crun, delegated `cpu`, `memory`, and `pids`
controllers, a compatible Quadlet generator, and finite journal retention.
`install` repeats
the check after rendering into a temporary directory and does not replace the
active units when validation fails.

This helper checks containment prerequisites; it does not validate the
x86-64-v3 instruction set. Confirm CPU compatibility separately before starting
the released images.

Verify SQL Server, OIDC, enabled HSA lookup, and other configured external TLS
connections with the target release images and site certificates before
cutover. UBI 10's cryptographic libraries and defaults can reject peers that
work in a different development image; see
[RHEL 10 security changes](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/considerations_in_adopting_rhel_10/security).
Correct weak certificates or peer TLS settings when verification fails.

Configure `SystemMaxUse` or `SystemKeepFree` in `journald.conf` on the host.
Podman's journald log driver writes container records directly to the journal,
so this finite retention setting is the enforced bound on journal disk use.

## Default service boundaries

Every service prevents new privileges, uses a read-only root filesystem, and
sends stdout and stderr to journald. All capabilities are dropped except for
SQL Server's bounded `NET_BIND_SERVICE` startup exception described below. The
`ReadOnlyTmpfs=false` setting is deliberate: it prevents Podman from silently
adding generic writable `/run`, `/tmp`, and `/var/tmp` mounts.

<!-- markdownlint-disable MD013 -->
| Service | Writable paths | Memory | CPU | PIDs / tasks |
| --- | --- | ---: | ---: | ---: |
| `app-runtime` | `/run/kravhantering/export` 1 GiB; `/tmp` 64 MiB | 4 GiB | 300% | 512 / 544 |
| nginx | `/etc/nginx/conf.d` 1 MiB; `/var/cache/nginx` 64 MiB; `/run` 1 MiB | 512 MiB | 100% | 128 / 160 |
| SQL Server | `/var/opt/mssql` durable volume; `/.system` 16 MiB; `/tmp` 512 MiB | 4 GiB | 200% | 1024 / 1056 |
| Keycloak | `/opt/keycloak/data` durable volume; `/opt/keycloak/lib/quarkus` 64 MiB; `/tmp` 512 MiB | 3 GiB | 100% | 512 / 544 |
<!-- markdownlint-enable MD013 -->

The application export tmpfs is sized above the default concurrent
output reservation: five 100 MiB CSV outputs plus three 50 MiB PDF outputs,
650 MiB in total. Tmpfs pages count against the service memory cgroup. Capacity
tests must therefore exercise the configured concurrent export maximum after
changing memory, storage, or application export limits. Increasing application
export limits can exceed the default tmpfs capacity; size storage for the
configured CSV and PDF reservations together. Podman's `U` tmpfs option maps the
dedicated export
mount to application UID 1000 while retaining mode `0700`. Each generated
operation directory and file is also created with mode `0700` and `0600`,
respectively.

nginx writes generated configuration to `/etc/nginx/conf.d`, request and proxy
buffers to `/var/cache/nginx`, and its PID to `/run/nginx.pid`. Access and error
logs go to stdout and stderr; `/var/log/nginx` is not writable. Podman's `U`
tmpfs option maps the three container-local writable roots to nginx UID 101
while retaining modes `0755`, `0750`, and `0755`; `notmpcopyup` keeps
root-owned image files out of those scratch mounts. TLS topologies require the
crun OCI runtime so nginx can also preserve the rootless service user's group
access to the host's `0640` private key.

SQL Server stores durable state under `/var/opt/mssql`. Keep that named volume
when reinstalling or upgrading units. The dedicated `/.system` tmpfs allows
empty-volume startup while keeping the remaining root filesystem read-only.
The pinned SQL Server image requires `NET_BIND_SERVICE` in its capability
bounding set to execute its database binary under `NoNewPrivileges`; do not
remove this exception or add other capabilities. SQL Server does not publish
port 1433 to the host.

Keycloak requires writable `/opt/keycloak/lib/quarkus` during startup. The
64 MiB tmpfs must retain Podman's default `tmpcopyup` behavior so the image's
files remain available. This is the only writable application-code directory;
it is ephemeral and `noexec`. Keycloak's H2 realm and administration state
remain in `kravhantering-keycloak-data`; the realm import bind is read-only.
Keycloak publishes no host port directly.

## Tested stateful images

Use the release archive's `container-stack.lock.json` as the source of exact
SQL Server and Keycloak image identities. Qualify the recorded manifest
digests, not mutable tags alone. When either digest changes, repeat startup
with the documented containment settings, inspect capabilities and writable
mounts, and complete the restore and upgrade checks in the
[RHEL qualification record](#rhel-qualification-record).

## Validated overrides

Set overrides in `/etc/kravhantering/release.env`. Numeric values are decimal
integers without signs, whitespace, units, or shell expressions. The helper
rejects unknown storage modes and values outside these ranges.

<!-- markdownlint-disable MD013 -->
| Variable | Default | Accepted values |
| --- | ---: | --- |
| `APP_RUNTIME_MEMORY_LIMIT_MIB` | 4096 | 4096–8192 |
| `APP_RUNTIME_CPU_QUOTA_PERCENT` | 300 | 50–online CPUs × 100 |
| `APP_RUNTIME_PIDS_LIMIT` | 512 | 128–1024 |
| `APP_RUNTIME_EXPORT_STORAGE` | `tmpfs` | `tmpfs` or `bind` |
| `APP_RUNTIME_EXPORT_TMPFS_MIB` | 1024 | 1024–4096 and at most half of app memory |
| `NGINX_MEMORY_LIMIT_MIB` | 512 | 256–1024 |
| `NGINX_CPU_QUOTA_PERCENT` | 100 | 25–online CPUs × 100 |
| `NGINX_PIDS_LIMIT` | 128 | 32–512 |
| `NGINX_CACHE_TMPFS_MIB` | 64 | 16–256 and at most half of nginx memory |
| `SQLSERVER_MEMORY_LIMIT_MIB` | 4096 | 2048–8192 |
| `SQLSERVER_CPU_QUOTA_PERCENT` | 200 | 50–online CPUs × 100 |
| `SQLSERVER_PIDS_LIMIT` | 1024 | 128–2048 |
| `SQLSERVER_TMPFS_MIB` | 512 | 128–2048 and at most half of SQL Server memory |
| `KEYCLOAK_MEMORY_LIMIT_MIB` | 3072 | 512–4096 |
| `KEYCLOAK_CPU_QUOTA_PERCENT` | 100 | 25–online CPUs × 100 |
| `KEYCLOAK_PIDS_LIMIT` | 512 | 64–1024 |
| `KEYCLOAK_QUARKUS_TMPFS_MIB` | 64 | 32–256 |
| `KEYCLOAK_TMPFS_MIB` | 512 | 128–2048; combined with `KEYCLOAK_QUARKUS_TMPFS_MIB`, at most half of Keycloak memory |
<!-- markdownlint-enable MD013 -->

The helper derives `TasksMax` as the PIDs limit plus 32 for the Podman and
conmon supervisors. App-node CPU quotas cannot exceed the smaller of online CPU
capacity and 400%. Single-node accounts for the services in the selected
identity profile and permits at most twice the online CPU capacity, capped at
800%. Defaults total
700% with bundled Keycloak and 600% with an external identity provider. The sum
of service memory limits cannot exceed 75% of host memory in either topology.
Single-node defaults total 11.5 GiB with Keycloak and require at least 16 GiB,
retaining 4.5 GiB for the host on a 16 GiB node. With an external identity
provider, single-node defaults total 8.5 GiB.

For disk-backed exports, set:

```ini
APP_RUNTIME_EXPORT_STORAGE=bind
APP_RUNTIME_EXPORT_HOST_PATH=/srv/kravhantering/export
```

The host path must be an existing absolute directory, not a symbolic link. It
must have mode `0700` and be readable, writable, and searchable by container
UID and GID 1000 through the service user's rootless mapping. Prepare it as
root, then establish the mapped owner as the service user:

```bash
sudo install -d -m 0700 -o kravhantering -g kravhantering \
  /srv/kravhantering/export
sudo -iu kravhantering podman unshare \
  chown 1000:1000 /srv/kravhantering/export
```

The helper verifies access through the same Podman user namespace. The path is
always mounted with a private SELinux label at
`/run/kravhantering/export` in the container. Do not make other application
paths writable.

## Network ownership

Use the helper instead of deriving Podman network names:

```bash
bin/kravhantering-quadlet.sh print-network \
  --topology single-node --purpose database
```

The app-node topology has an internal `edge` network shared by nginx and the
app, plus an `egress` network used by the app. Single-node adds an internal
`database` network; the app and SQL Server join it, as do temporary database
jobs. With bundled Keycloak, single-node also adds an internal `identity`
network shared by nginx and Keycloak. Only nginx publishes host ports.

With bundled Keycloak, the application maps the public hostname to Podman's
host gateway so its OIDC requests traverse nginx's published HTTPS route.
The `hardened-bundled` profile also publishes a separate nginx management
listener using `KEYCLOAK_MANAGEMENT_HTTPS_BIND`. Keep that explicit host address
restricted to the approved management network; it requires mutual TLS.

Podman bridge membership does not provide directional, per-port, or DNS-name
egress policy. The host firewall, an approved egress proxy, and upstream ACLs
remain responsible for source CIDR restrictions and destination allowlists.

## Logging and evidence limits

The application multiplexes ordinary, capacity, and security-audit JSON records
on stdout and stderr. Podman's journald driver sends those records directly to
the host journal; systemd service-unit rate-limit directives do not constrain
that path. Finite `SystemMaxUse` or `SystemKeepFree` therefore remains a host
prerequisite and bounds journal disk growth. If per-service flood control or
complete external security-audit retention is required, use a separate
lossless log pipeline
rather than relying on service-unit suppression.

Automated release smoke runs on Ubuntu and does not establish RHEL
qualification. Before production rollout, retain RHEL evidence for SELinux
labels, firewalld policy, the supported Podman version, load behaviour,
vendor-image upgrades, backup recovery, and persistence across a real reboot.

## RHEL qualification record

Before promoting a release to production, run the selected topology under its
expected load on a supported RHEL host and retain these results with the change
record. The commands below use single-node with bundled Keycloak; omit
Keycloak for an external identity provider, and omit both stateful services for
app-node. Use the selected topology in `verify-host`:

```bash
getenforce
podman version
firewall-cmd --get-active-zones
firewall-cmd --list-all
systemctl is-active systemd-journald
sudo -iu kravhantering \
  /opt/kravhantering/current/bin/kravhantering-quadlet.sh verify-host \
  --topology single-node
sudo -iu kravhantering systemctl --user show \
  kravhantering-app-runtime.service kravhantering-keycloak.service \
  kravhantering-nginx.service kravhantering-sqlserver.service \
  -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax
sudo -iu kravhantering podman inspect \
  kravhantering-app-runtime kravhantering-keycloak \
  kravhantering-nginx kravhantering-sqlserver
```

Confirm the expected SELinux labels on every bind source with `ls -lZ`, run the
public health, authentication, application, and API-documentation checks, and
repeat the output-capacity and nginx buffering load. Reboot the host, then
verify that lingering is enabled, the topology target is active, the named
volumes and purpose-specific networks remain, and health and readiness recover
without manual login:

```bash
loginctl show-user kravhantering -p Linger
sudo -iu kravhantering systemctl --user is-active \
  kravhantering-app-node.target
sudo -iu kravhantering podman network ls
sudo -iu kravhantering podman volume ls
```

For `single-node`, substitute `kravhantering-single-node.target`. Record the
exact RHEL, kernel, systemd, Podman, SELinux policy, and firewalld versions with
the results. On an isolated qualification copy, complete the documented SQL
Server backup/restore and, when bundled, Keycloak volume backup/restore, then
perform the planned vendor-image upgrade and repeat authentication, database
reads/writes, and containment inspection. A missing controller, unexpected
writable mount,
extra published port, missing finite journal retention, unavailable journald,
failed restore, failed upgrade migration, or failed reboot recovery blocks
rollout.
