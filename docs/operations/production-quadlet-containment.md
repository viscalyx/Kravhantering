# Production Quadlet Containment

This guide defines the supported containment contract for the production
services. It applies to the `app-node-tls`, `app-node-http`, and `single-node`
topologies in the deployment archive. SQL Server and Keycloak are present only
in `single-node`.

## Host prerequisites

Run the helper as the dedicated rootless service user before installing or
reinstalling units:

```bash
cd /opt/kravhantering/current
bin/kravhantering-quadlet.sh verify-host --topology app-node-tls
```

The check fails closed unless the host has cgroup v2, a working user systemd
manager, rootless Podman, delegated `cpu`, `memory`, and `pids` controllers, a
compatible Quadlet generator, and finite journal retention. `install` repeats
the check after rendering into a temporary directory and does not replace the
active units when validation fails.

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
| Keycloak | `/opt/keycloak/data` durable volume; `/opt/keycloak/lib/quarkus` 64 MiB; `/tmp` 512 MiB | 2 GiB | 100% | 512 / 544 |
<!-- markdownlint-enable MD013 -->

The application export tmpfs is sized above the built-in maximum concurrent
output reservation: five 100 MiB CSV outputs plus three 50 MiB PDF outputs,
650 MiB in total. Tmpfs pages count against the service memory cgroup. Capacity
tests must therefore exercise the configured concurrent export maximum after
changing either limit. Podman's `U` tmpfs option maps the dedicated export
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

SQL Server writes databases, transaction logs, backups, dumps, secrets, and its
own logs below `/var/opt/mssql`; the existing named volume preserves those
semantics. The Quadlet sets both `HOME` and the container working directory to
that volume and preserves the image's launcher, which performs the image's
startup checks before starting the database engine. SQL Server 2025 CU8 can
still probe `/.system` during an empty-volume start. A dedicated 16 MiB tmpfs
keeps that compatibility path writable without opening the rest of the root
filesystem; mode `0700` and Podman's `U` option map it to the container user,
and `nosuid`, `nodev`, and `noexec` retain the scratch-path boundary. The 4 GiB
cgroup default stays above Microsoft's 2 GiB startup minimum. The pinned
`mcr.microsoft.com/mssql/server:2025-CU8-ubuntu-24.04` image has
`cap_net_bind_service=ep` on `/opt/mssql/bin/sqlservr`. With all capabilities
absent from the bounding set, `NoNewPrivileges` makes the kernel reject that
binary with exit 126 and `Operation not permitted`. Adding only
`NET_BIND_SERVICE` to the bounding set allows startup; live probes show
`CapEff=0`, `NoNewPrivs=1`, and no other bounding capability for both
`sqlservr` processes. SQL Server does not publish port 1433 to the host.

The pinned `quay.io/keycloak/keycloak:26.7.3-0` image augments Quarkus during
stock-image startup. A read-only root without an exception fails while
replacing `/opt/keycloak/lib/quarkus/transformed-bytecode.jar`. That image
directory is about 5 MiB. The 64 MiB tmpfs relies on Podman's default
`tmpcopyup` behavior to preserve the image files while bounding generated
output. It is ephemeral, `noexec`, and the only writable application-code
directory. Keycloak's H2 realm and administration state remain in
`kravhantering-keycloak-data`; the realm import bind is read-only. Live probes
show an empty capability bounding set, `CapEff=0`, and `NoNewPrivs=1` after
startup. Keycloak publishes no host port.

## Tested stateful images

The production archive records these exact stateful image contracts in its
stack lock. Qualification must use the recorded manifest digest, not a mutable
tag alone.

<!-- markdownlint-disable MD013 -->
| Service | Tag | Manifest digest |
| --- | --- | --- |
| SQL Server | `mcr.microsoft.com/mssql/server:2025-CU8-ubuntu-24.04` | `sha256:4bab24f36c1ecd48e85f7d37df26e6bf301641d84c3fe652f9a0dcc947d512e1` |
| Keycloak | `quay.io/keycloak/keycloak:26.7.3-0` | `sha256:88943b6ad06d6293a239f0dfca5acec64218c9b3ab327bf9c936acf408a6ae3b` |
<!-- markdownlint-enable MD013 -->

Repeat the failure/success probes whenever either digest changes. Microsoft
documents `/var/opt/mssql` as the persistent container root and a 2 GiB startup
minimum. Keycloak documents `/opt/keycloak/data/import` as the container realm
import directory. Podman documents `tmpcopyup` as the default for tmpfs mounts;
the Keycloak exception depends on that behavior and the generator preflight
must continue to reject an unsupported rendering.

## Validated overrides

Set overrides in `/etc/kravhantering/release.env`. Values are decimal integers
without signs, whitespace, units, or shell expressions. The helper rejects
unknown storage modes and values outside these ranges.

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
capacity and 400%. Single-node accounts for all four services and permits at
most twice the online CPU capacity, capped at 800%; the default 700% envelope
allows bounded burst contention on the four-core CI/reference host. The sum of
all single-node memory limits cannot exceed 75% of host memory. Defaults total
11.5 GiB and require at least 16 GiB, retaining 4.5 GiB for the host on a
16 GiB node.

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
app, plus an `egress` network used by the app. Single-node adds internal
`identity` and `database` networks. nginx joins `edge` and `identity`, the app
joins `edge`, `database`, and `egress`, Keycloak joins `identity`, and SQL
Server joins `database`. Temporary database jobs join only `database`. Only
nginx publishes a host port.

On single-node, the application maps the public hostname to Podman's host
gateway so its OIDC discovery and token requests traverse the published
`443`-to-`8443` nginx route. Podman 4.9 lacks the newer Quadlet `AddHost` and
`NetworkAlias` keys, so the units use narrowly scoped `PodmanArgs` only for
that host mapping and their required service DNS aliases. These arguments do
not grant a capability or add a writable path, and incompatible generators
fail during the helper preflight.

Podman bridge membership does not provide directional, per-port, or DNS-name
egress policy. The host firewall, an approved egress proxy, and upstream ACLs
remain responsible for source CIDR restrictions and destination allowlists.

## Logging and evidence limits

The application multiplexes ordinary, capacity, and security-audit JSON records
on stdout and stderr. Podman's journald driver sends those records directly to
the host journal; systemd service-unit rate-limit directives do not constrain
that path. Finite `SystemMaxUse` or `SystemKeepFree` therefore remains a host
prerequisite and bounds journal disk growth. The database-backed action log is
the durable audit record. If per-service flood control or complete external
security-audit retention is required, use a separate lossless log pipeline
rather than relying on service-unit suppression.

PR and release workflows install the real production archive on Ubuntu 24.04
under a dedicated rootless user, execute the documented database lifecycle,
inspect the generated units and live containers, run the release Playwright
suite, and exercise every service restart, reinstall, stop, start, and removal.
The smoke creates SQL Server and Keycloak backups, restores each into an
isolated `kravhantering-ci-*` volume, and proves database usability plus
recovered Keycloak administrator authentication and realm administration before
deleting only those CI volumes. The portable application-release upgrade seam
installs the restricted units over existing durable volumes, cycles the target,
reruns database migration, and then verifies authentication, database
reads/writes, and cgroup health through the release suite. Vendor-image version
changes are outside this containment change and remain an explicit RHEL
qualification gate. The journal artifact replaces configured stateful password,
secret, and token values even when vendor output emits a bare value, then the
smoke asserts those values are absent. This proves archive and Quadlet parity.
Before production rollout, retain RHEL qualification for SELinux labels,
firewalld policy, the supported RHEL Podman version, load behaviour, vendor
upgrade migration, and persistence across a real host reboot.

## RHEL qualification record

Before promoting a release to production, run the selected topology under its
expected load on a supported RHEL host and retain these results with the change
record:

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
Server backup/restore and Keycloak volume backup/restore, then perform the
planned vendor-image upgrade and repeat authentication, database reads/writes,
and containment inspection. A missing controller, unexpected writable mount,
extra published port, missing finite journal retention, unavailable journald,
failed restore, failed upgrade migration, or failed reboot recovery blocks
rollout.
