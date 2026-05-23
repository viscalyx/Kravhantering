# RHEL 10 Production Deployment From Release Artifacts

<!-- cSpell:words coreutils datawriter fullchain privkey -->

This guide describes how to install and upgrade Kravhantering on a clean
Red Hat Enterprise Linux 10 host from released artifacts only. The target host
does not need a repository clone, development dependencies, GitHub Actions
checkout, Playwright assets, or source-tree helper scripts.

The primary production topology is an app node that runs nginx and
`app-runtime` in a rootless Podman Compose network. SQL Server and the IdP are
external services. A full single-node variant is also supported for controlled
installations where SQL Server and Keycloak run in the same Podman Compose
network as the app.

## Release Inputs

The internal release repository must provide these files from the same release:

- `kravhantering-production-deploy-<version>.tar.gz`
- `kravhantering-production-deploy-<version>.tar.gz.sha256`
- `container-stack.lock.json`
- `public/build.json`
- `release-metadata.json`
- SBOM files for `app-runtime` and `db-job`

The internal container registry must contain digest-preserved mirrors for:

- `app-runtime`
- `db-job`
- nginx
- SQL Server, only for the single-node internal variant
- Keycloak, only for the single-node internal variant

Digest-preserved means the image digest in the internal registry is the same
`sha256:<digest>` value listed in `container-stack.lock.json`. Mirroring
mechanics are outside this guide; this guide assumes the internal repository
and registry already contain the approved release assets.

## Clean RHEL 10 Host

Install the host as a minimal RHEL 10 server. Recommended baseline:

- 4 vCPU and 8 GiB RAM for an app node
- 8 vCPU and 16 GiB RAM for the single-node internal variant
- separate XFS-backed storage for container data and backups
- registered RHEL repositories
- outbound access to the internal release repository and internal registry
- inbound access only from the load balancer, admin network and approved
  monitoring systems

Install runtime packages as an administrator:

```bash
sudo dnf install -y podman podman-compose tar gzip coreutils
podman --version
PODMAN_COMPOSE_PROVIDER=podman-compose podman compose version
```

Create a dedicated rootless service user:

```bash
sudo useradd --create-home --shell /bin/bash kravhantering
sudo loginctl enable-linger kravhantering
```

Create immutable release and mutable configuration directories:

```bash
sudo install -d -o root -g root -m 0755 /opt/kravhantering/releases
sudo install -d -o root -g root -m 0755 /etc/kravhantering
sudo install -d -o root -g kravhantering -m 0750 /etc/kravhantering/tls
sudo install -d -o root -g kravhantering -m 0750 /etc/kravhantering/keycloak
```

Release files live under `/opt/kravhantering/releases/<version>`.
Site-specific environment files, certificates and realm files live under
`/etc/kravhantering`.

The bundled Compose files mount release templates, TLS material and the
single-node Keycloak realm as `:ro,Z` bind mounts. `ro` keeps those host files
read-only inside the containers, and `Z` gives each private bind mount an
SELinux label that Podman containers can read on RHEL. The named SQL Server and
Keycloak data volumes do not use `Z`; Podman owns those volumes.

If this host terminates TLS directly on port 443, allow rootless Podman to bind
that port. Skip this step when the host only receives HTTP traffic from a
TLS-terminating load balancer:

```bash
printf '%s\n' 'net.ipv4.ip_unprivileged_port_start=443' \
  | sudo tee /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

## Install a Release

Download the deployment bundle and checksum from the internal release
repository:

```bash
VERSION=1.2.3
mkdir -p "/tmp/kravhantering-${VERSION}"
cd "/tmp/kravhantering-${VERSION}"

curl -O "https://release.example.internal/kravhantering/${VERSION}/kravhantering-production-deploy-${VERSION}.tar.gz"
curl -O "https://release.example.internal/kravhantering/${VERSION}/kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
sha256sum -c "kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
```

Install the bundle:

```bash
sudo install -d -o root -g root -m 0755 \
  "/opt/kravhantering/releases/${VERSION}"
sudo tar -xzf "kravhantering-production-deploy-${VERSION}.tar.gz" \
  -C "/opt/kravhantering/releases/${VERSION}" \
  --strip-components=1
sudo ln -sfn "/opt/kravhantering/releases/${VERSION}" \
  /opt/kravhantering/current
```

Review the release manifest before creating local configuration:

```bash
less /opt/kravhantering/current/DEPLOYMENT-MANIFEST.json
less /opt/kravhantering/current/container-stack.lock.json
```

Copy templates into `/etc/kravhantering` on first install:

```bash
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/release.env.template \
  /etc/kravhantering/release.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/app.env.template \
  /etc/kravhantering/app.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/db-job.env.template \
  /etc/kravhantering/db-job.env
```

Edit the copied files with environment-specific values. Do not edit files
under `/opt/kravhantering/current`; they are release artifacts.

## Image References

Set image references in `/etc/kravhantering/release.env` to internal registry
refs that preserve the release digests:

```env
APP_RUNTIME_IMAGE_REF=registry.example.internal/kravhantering-app-runtime@sha256:<digest>
DB_JOB_IMAGE_REF=registry.example.internal/kravhantering-db-job@sha256:<digest>
NGINX_IMAGE_REF=registry.example.internal/nginx@sha256:<digest>
```

For the single-node internal variant, also set:

```env
SQLSERVER_IMAGE_REF=registry.example.internal/mssql/server@sha256:<digest>
KEYCLOAK_IMAGE_REF=registry.example.internal/keycloak/keycloak@sha256:<digest>
```

Pull the images as the service user:

```bash
sudo -iu kravhantering
set -a
. /etc/kravhantering/release.env
set +a

podman pull "$APP_RUNTIME_IMAGE_REF"
podman pull "$DB_JOB_IMAGE_REF"
podman pull "$NGINX_IMAGE_REF"
```

For the single-node internal variant:

```bash
podman pull "$SQLSERVER_IMAGE_REF"
podman pull "$KEYCLOAK_IMAGE_REF"
```

## External SQL Server Primary Path

The preferred production path is DBA-pre-provisioned SQL Server. The DBA or
database platform tooling must provide:

- database name, normally `kravhantering`
- app runtime login/user with `db_datareader` and `db_datawriter`
- db-job login/user with `db_owner`
- encrypted connection settings and trust configuration
- backup and restore procedure approved for the release window

The bundle includes `sqlserver/dba-provision.sql.template` for sites that want
a T-SQL starting point. Sites using provisioning tools can implement the same
contract without running the template.

Set `/etc/kravhantering/app.env` with the app runtime user:

```env
DB_HOST=sqlserver.example.internal
DB_PORT=1433
DB_NAME=kravhantering
DB_USER=kravhantering_app
DB_PASSWORD=<app-runtime-password>
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

Set `/etc/kravhantering/db-job.env` with the migration/seed user:

```env
DB_HOST=sqlserver.example.internal
DB_PORT=1433
DB_NAME=kravhantering
DB_USER=kravhantering_job
DB_PASSWORD=<db-job-password>
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

Do not keep `DB_BOOTSTRAP_*` values in `db-job.env` for the normal
DBA-pre-provisioned path.

## External IdP Primary Path

Register a confidential OIDC web client in the external IdP. The app requires:

- issuer URL reachable by app containers and browsers
- client id, normally `kravhantering-app`
- client secret
- redirect URI `https://<app-host>/api/auth/callback`
- post-logout redirect URI `https://<app-host>/`
- `roles` claim as a JSON array of strings
- `employeeHsaId` claim on ID token, access token and userinfo
- optional MCP service client audience for `kravhantering-app`

Set `/etc/kravhantering/app.env`:

```env
NEXT_PUBLIC_SITE_URL=https://kravhantering.example.internal
AUTH_OIDC_ISSUER_URL=https://idp.example.internal/realms/kravhantering
AUTH_OIDC_CLIENT_ID=kravhantering-app
AUTH_OIDC_CLIENT_SECRET=<client-secret>
AUTH_OIDC_REDIRECT_URI=https://kravhantering.example.internal/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=https://kravhantering.example.internal/
AUTH_OIDC_ROLES_CLAIM=roles
AUTH_OIDC_API_AUDIENCE=kravhantering-app
AUTH_SESSION_COOKIE_PASSWORD=<at-least-32-random-characters>
```

For Keycloak, the client must emit the realm roles and `hsaId` user attribute
as the `roles` and `employeeHsaId` claims. The bundle's
`keycloak/realm-kravhantering-production.template.json` shows the expected
mapper shape.

### Keycloak Appendix

When the external IdP is Keycloak, create or update a realm with:

- confidential client `kravhantering-app`
- client secret stored only in `/etc/kravhantering/app.env`
- standard authorization code flow enabled
- redirect URI `https://<app-host>/api/auth/callback`
- web origin `https://<app-host>`
- post-logout redirect URI `https://<app-host>/`
- realm roles `Reviewer`, `Admin` and `PrivacyOfficer`
- mapper that emits realm roles as a multivalued `roles` claim
- mapper that emits the user `hsaId` attribute as `employeeHsaId`
- optional service-account client `kravhantering-mcp` with an audience mapper
  for `kravhantering-app`

Do not import the release-smoke realm into production. The smoke-test realm
contains public test credentials.

## App Node With TLS on the Node

Use this when the RHEL app node terminates TLS itself.

Install the server certificate and private key:

```bash
sudo install -o root -g kravhantering -m 0640 fullchain.pem \
  /etc/kravhantering/tls/fullchain.pem
sudo install -o root -g kravhantering -m 0640 privkey.pem \
  /etc/kravhantering/tls/privkey.pem
```

Validate the external database and IdP, then run migration and required seed
once for the release:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" wait
podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" migrate
podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" seed:required
```

Start the app node:

```bash
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/app-node-tls.compose.yml up -d
```

Check readiness through nginx:

```bash
curl --fail --silent --show-error \
  https://kravhantering.example.internal/api/health
curl --fail --silent --show-error \
  https://kravhantering.example.internal/api/ready
```

## App Node Behind a TLS-Terminating Load Balancer

Use this when an external load balancer terminates TLS and forwards HTTP to
the app-node nginx. Set the bind address in `/etc/kravhantering/release.env`:

```env
NGINX_HTTP_BIND=127.0.0.1:8080
```

Change the value when the load balancer connects over a dedicated private
network interface, for example `10.10.20.15:8080`.

Start with the HTTP Compose file:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/app-node-http.compose.yml up -d
```

The app-facing public URLs in `app.env` must still use the external HTTPS
origin exposed by the load balancer.

## Optional User Systemd Wrapper

Manual `podman compose` is the primary operational workflow. If the site wants
user-systemd autostart, copy the template and adjust the Compose file name if
the HTTP variant is used:

```bash
sudo -iu kravhantering
mkdir -p ~/.config/systemd/user
cp /opt/kravhantering/current/systemd/kravhantering-compose.service \
  ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kravhantering-compose.service
```

The service runs `podman compose up -d` from `/opt/kravhantering/current` and
`podman compose down` on stop.

## Single-Node Internal Variant

Use this variant only when the approved deployment model is one RHEL host that
runs nginx, app-runtime, SQL Server, Keycloak and db-job in the same Podman
Compose network.

Copy the extra templates:

```bash
REALM_TEMPLATE=/opt/kravhantering/current/keycloak
REALM_TEMPLATE="${REALM_TEMPLATE}/realm-kravhantering-production.template.json"

sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/sqlserver.env.template \
  /etc/kravhantering/sqlserver.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/keycloak.env.template \
  /etc/kravhantering/keycloak.env
sudo install -o root -g kravhantering -m 0640 \
  "$REALM_TEMPLATE" \
  /etc/kravhantering/keycloak/realm-kravhantering-production.json
```

Replace every placeholder secret, hostname and redirect URI in those files.
For the internal Keycloak issuer, set app values like:

```env
DB_HOST=sqlserver
DB_TRUST_SERVER_CERTIFICATE=true
NEXT_PUBLIC_SITE_URL=https://kravhantering.example.internal
AUTH_OIDC_ISSUER_URL=https://kravhantering.example.internal/auth/realms/kravhantering-production
AUTH_OIDC_REDIRECT_URI=https://kravhantering.example.internal/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=https://kravhantering.example.internal/
```

Install TLS cert, private key and the issuing CA certificate:

```bash
sudo install -o root -g kravhantering -m 0640 fullchain.pem \
  /etc/kravhantering/tls/fullchain.pem
sudo install -o root -g kravhantering -m 0640 privkey.pem \
  /etc/kravhantering/tls/privkey.pem
sudo install -o root -g kravhantering -m 0640 ca.crt \
  /etc/kravhantering/tls/ca.crt
```

Start SQL Server and Keycloak, then run the one-time database jobs:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current

podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml up -d sqlserver keycloak
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml run --rm db-bootstrap
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml run --rm db-migrate
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml run --rm db-seed-required
podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml up -d app-runtime nginx
```

Do not run `db-seed-demo` in production.

## Planned-Downtime Upgrade

Use planned downtime unless a future release explicitly documents rolling
compatibility.

1. Confirm the target release bundle, checksum and mirrored image digests.
2. Confirm a tested SQL Server backup or restore point.
3. Drain or disable traffic to all app nodes.
4. Stop the app nodes:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   podman compose --env-file /etc/kravhantering/release.env \
     -f compose/app-node-tls.compose.yml down
   ```

5. Install the new release bundle under `/opt/kravhantering/releases`.
6. Update `/opt/kravhantering/current` to the new release.
7. Update `/etc/kravhantering/release.env` image refs to the new digests.
8. Run `db-job migrate` and `seed:required` once.
9. Start the app nodes with the new release.
10. Check `/api/health`, `/api/ready`, sign-in and a read-only UI workflow.
11. Re-enable traffic.

For the single-node internal variant, stop `nginx` and `app-runtime` first,
leave SQL Server and Keycloak running, run the database jobs, then start the
new `app-runtime` and `nginx`.

## Rollback

Rollback after a migration requires restoring the database backup or restore
point taken before the upgrade. The supported sequence is:

1. Disable traffic.
2. Stop app nodes.
3. Restore SQL Server to the pre-upgrade restore point.
4. Point `/opt/kravhantering/current` back to the previous release directory.
5. Restore the previous `/etc/kravhantering/release.env` image refs.
6. Start the previous app nodes.
7. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.

## Controlled Bootstrap Alternative

When DBA pre-provisioning is not available, `db-job bootstrap` can create the
database and SQL principals with temporary SQL admin credentials. Use this only
as a controlled operational exception:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" bootstrap
podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" migrate
podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" seed:required
```

After bootstrap, remove `DB_BOOTSTRAP_ADMIN_USER` and
`DB_BOOTSTRAP_ADMIN_PASSWORD` from `/etc/kravhantering/db-job.env`.

## Operational Evidence

Keep these files with the deployment record:

- deployment bundle checksum
- `DEPLOYMENT-MANIFEST.json`
- `container-stack.lock.json`
- `public/build.json`
- `release-metadata.json`
- SQL backup or restore-point reference
- final `/etc/kravhantering/release.env` image refs
- readiness check results

Do not archive `/etc/kravhantering/*.env`, private keys or raw container
inspect output in general release evidence stores.
