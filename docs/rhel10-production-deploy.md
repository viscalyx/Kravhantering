# RHEL 10 Production Deployment From Release Artifacts

<!-- cSpell:words coreutils datawriter firewalld fullchain nameserver privkey -->
<!-- cSpell:words ipv4 resolv -->

This guide describes how to install and operate Kravhantering on a clean
Red Hat Enterprise Linux 10 host from released artifacts only. The target host
does not need a repository clone, development dependencies, GitHub Actions
checkout, Playwright assets, or source-tree helper scripts.

This enterprise production topology is an app node that runs nginx and
`app-runtime` in a rootless Podman Compose network. SQL Server and the IdP are
external services.

For the self-contained single-node topology where SQL Server and Keycloak run
on the same RHEL host, use
[rhel10-production-single-node-self-contained-deploy.md](./rhel10-production-single-node-self-contained-deploy.md).
For upgrades and rollback, use
[rhel10-production-upgrade.md](./rhel10-production-upgrade.md).
To uninstall a first install of this topology, use
[rhel10-production-uninstall.md](./rhel10-production-uninstall.md).

>[!IMPORTANT]
>For disconnected deployment, first follow
>[rhel10-production-disconnected.md](./rhel10-production-disconnected.md). The
>disconnected guide prepares the transferable bundle before this deployment
>guide starts and tells you where to resume these regular deployment steps on
>the disconnected app node.

<!-- markdownlint-disable MD013 -->
![Kravhantering Infographic Production Access and Service Flow](images/infographic-production-access-and-service-flow.png)
<!-- markdownlint-enable MD013 -->

## Release Inputs

The internal release repository must provide these files from the same release:

- `kravhantering-production-deploy-<version>.tar.gz`
- `kravhantering-production-deploy-<version>.tar.gz.sha256`
- `container-stack.lock.json`
- `public/build.json`
- `release-metadata.json`
- SBOM files for `app-runtime` and `db-job`

The site must provide approved runtime image refs for:

- `app-runtime`
- `db-job`
- nginx

The refs must use tag-style `image:tag` values that point at public upstream
registries or an internal registry mirror. Each configured ref must resolve to
the locked `imageId` in `container-stack.lock.json` when inspected with Podman.
For third-party images, prefer release-specific internal mirror tags instead
of moving public tags such as `stable-alpine`. The lock file, not the tag text,
is the source of truth; `bin/kravhantering-images.sh verify` fails if a tag now
resolves to another image ID.

## Configuration BoM

Before editing templates, record these site values. The table separates values
that must be planned from defaults or derived values that usually only need
verification.

<!-- markdownlint-disable MD013 -->
| Name | Applies to | Default / derived value | Plan or record when |
| --- | --- | --- | --- |
| `VERSION` | Release artifact names | No default | Always record the release version to install, for example `1.2.3`. |
| `APP_HOST` | App URLs, IdP redirect/logout settings, IdP web origins, TLS certificate SANs and smoke checks | No default | Always record the public DNS name without `https://`, for example `kravhantering.example.internal`. |
| `NEXT_PUBLIC_SITE_URL` | `NEXT_PUBLIC_SITE_URL` in `app.env` | `https://<APP_HOST>` | Verify after choosing `APP_HOST`; plan only if the public URL cannot use the normal scheme and host. |
| `HSA_PERSON_LOOKUP_URL` | `HSA_PERSON_LOOKUP_URL` in `app.env` | No default | Always record the approved server-side HSA person lookup endpoint, normally the environment's Kong or integration-platform REST facade. |
| `HSA_PERSON_LOOKUP_TIMEOUT_MS` | `HSA_PERSON_LOOKUP_TIMEOUT_MS` in `app.env` | `5000` | Plan only if the HSA integration path needs another timeout. |
| `HSA_PERSON_LOOKUP_*` auth vars | Optional mTLS/OAuth2 vars in `app.env` | Blank | Set only when the approved external integrationsplattform requires app-to-platform mTLS, OAuth2 client credentials, or both. |
| `NGINX_RESOLVER` | `NGINX_RESOLVER` in `release.env` | `10.89.0.1` | Verify from the actual Compose network. It can change when the internal network is renamed, recreated or assigned another subnet. |
| `SQLSERVER_HOST` | `DB_HOST` in `app.env` and `db-job.env` | No default | Always obtain the external SQL Server host from the DBA. |
| `DB_PORT` | `DB_PORT` in `app.env` and `db-job.env` | `1433` | Plan only if the DBA provides another SQL Server port. |
| `DB_NAME` | `DB_NAME` in `app.env` and `db-job.env` | `kravhantering` | Plan only if the DBA provisions a different database name. |
| `APP_DB_USER` | `DB_USER` in `app.env` | `kravhantering_app` | Plan only if the DBA provisions a different app runtime login/user. |
| `APP_DB_PASSWORD` | `DB_PASSWORD` in `app.env` | No default | Always obtain or generate a unique app runtime SQL Server password. If the deployment operator generates it, use the SQL Server password fallback in [Generate Unique Secrets](#generate-unique-secrets). |
| `DB_JOB_USER` | `DB_USER` in `db-job.env` | `kravhantering_job` | Plan only if the DBA provisions a different migration/seed login/user. |
| `DB_JOB_PASSWORD` | `DB_PASSWORD` in `db-job.env` | No default | Always obtain or generate a unique db-job SQL Server password. Must differ from `APP_DB_PASSWORD`. If the deployment operator generates it, use the SQL Server password fallback in [Generate Unique Secrets](#generate-unique-secrets). |
| `DB_PASSWORD` | `app.env` and `db-job.env` | Maps to `APP_DB_PASSWORD` in `app.env` and `DB_JOB_PASSWORD` in `db-job.env` | No separate value to plan; verify each file receives the correct password. |
| `DB_ENCRYPT` | `DB_ENCRYPT` in `app.env` and `db-job.env` | `true` | Plan only if the DBA-approved production SQL Server contract explicitly differs. |
| `DB_TRUST_SERVER_CERTIFICATE` | `DB_TRUST_SERVER_CERTIFICATE` in `app.env` and `db-job.env` | `false` | Plan only if the site has an approved exception to trust the presented SQL Server certificate directly. |
| `DB_CONNECTION_TIMEOUT_MS` | `DB_CONNECTION_TIMEOUT_MS` in `db-job.env` | `15000` | Plan only if the external database or network path needs a different connection timeout. |
| `DB_REQUEST_TIMEOUT_MS` | `DB_REQUEST_TIMEOUT_MS` in `db-job.env` | `30000` | Plan only if migrations or required seed need a different SQL statement timeout. |
| `OIDC_ISSUER_URL` | `AUTH_OIDC_ISSUER_URL` in `app.env` | No default | Always obtain the external IdP issuer URL. |
| `OIDC_CLIENT_ID` | `AUTH_OIDC_CLIENT_ID` in `app.env` | `kravhantering-app` | Plan only if the IdP client id differs. |
| `OIDC_CLIENT_SECRET` | `AUTH_OIDC_CLIENT_SECRET` in `app.env` | No default | Always obtain or generate the external IdP confidential client secret. If the IdP does not generate one, use the opaque-secret fallback in [Generate Unique Secrets](#generate-unique-secrets). |
| `AUTH_OIDC_REDIRECT_URI` | `AUTH_OIDC_REDIRECT_URI` in `app.env` and IdP redirect settings | `https://<APP_HOST>/api/auth/callback` | Verify after choosing `APP_HOST`; plan only if the IdP registration must differ. |
| `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI` | `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI` in `app.env` and IdP logout settings | `https://<APP_HOST>/` | Verify after choosing `APP_HOST`; plan only if the IdP registration must differ. |
| `AUTH_OIDC_ROLES_CLAIM` | `AUTH_OIDC_ROLES_CLAIM` in `app.env` | `roles` | Plan only if the IdP emits application roles in another claim. |
| `AUTH_OIDC_SCOPES` | `AUTH_OIDC_SCOPES` in `app.env` | `openid profile email` | Plan only if the IdP needs additional scopes to release required claims. |
| `AUTH_OIDC_API_AUDIENCE` | `AUTH_OIDC_API_AUDIENCE` in `app.env` | `kravhantering-app` | Plan only if the IdP audience differs from the client id. |
| `AUTH_SESSION_COOKIE_NAME` | `AUTH_SESSION_COOKIE_NAME` in `app.env` | `kravhantering_session` | Plan only if this host serves another deployment on the same browser cookie scope. |
| `SESSION_COOKIE_PASSWORD` | `AUTH_SESSION_COOKIE_PASSWORD` in `app.env` | No default | Always generate with the opaque-secret fallback in [Generate Unique Secrets](#generate-unique-secrets). |
| `AUTH_SESSION_TTL_SECONDS` | `AUTH_SESSION_TTL_SECONDS` in `app.env` | `28800` | Plan only if another absolute browser-session lifetime is approved. |
| `MCP_CLIENT_ID` | `MCP_CLIENT_ID` in `app.env` | `kravhantering-mcp` | Plan only if MCP service tokens use a different service-account client id. |
| `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` in `app.env` | Empty | Plan only if AI requirement generation is approved. |
| `OPENROUTER_MGMT_API_KEY` | `OPENROUTER_MGMT_API_KEY` in `app.env` | Empty | Plan only if AI requirement generation and organization credit display are approved. |
| `NEXT_PUBLIC_DEFAULT_MODEL` | `NEXT_PUBLIC_DEFAULT_MODEL` in `app.env` | Empty | Plan only if the deployment should preselect a public default AI model. |
<!-- markdownlint-enable MD013 -->

### Generate Unique Secrets

Use the site's approved secret manager or password generator whenever possible.
Generate one value per secret and store each value in the deployment secret
store before editing `/etc/kravhantering`.

For OIDC client secrets, session-cookie passwords and optional MCP client
secrets, a good command-line fallback is:

```bash
openssl rand -base64 48
```

Run the command separately for each secret. Do not reuse one generated value
for unrelated settings.

For SQL Server login passwords, use the DBA-approved password generator and
the site's SQL Server password policy. If the operator must generate one on the
host, this fallback creates a 32-character password with uppercase, lowercase,
digit and symbol characters:

```bash
printf 'S1q!%s\n' "$(openssl rand -hex 14)"
```

Regenerate the SQL password if it contains the login name or does not satisfy
the site password policy.

## Prepare RHEL 10 Host

Install the host as a minimal RHEL 10 server. Recommended baseline:

- 4 vCPU and 8 GiB RAM for an app node
- separate XFS-backed storage for container data and backups
- registered RHEL repositories
- outbound access to the internal release repository and internal registry
- inbound access only from the load balancer, admin network and approved
  monitoring systems

Install runtime packages as an administrator:

```bash
sudo dnf install -y podman podman-compose tar gzip coreutils jq
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
```

Release files live under `/opt/kravhantering/releases/<version>`.
Site-specific environment files and certificates live under `/etc/kravhantering`.

The bundled Compose files keep bind mounts read-only. Because the stack runs as
the rootless `kravhantering` user and the mounted files are root-owned under
`/opt` and `/etc`, apply SELinux labels as an administrator instead of relying
on Podman `:Z` relabeling at container start.

If this host terminates TLS directly on port 443, allow rootless Podman to bind
that port. Skip this step when the host only receives HTTP traffic from a
TLS-terminating load balancer:

```bash
printf '%s\n' 'net.ipv4.ip_unprivileged_port_start=443' \
  | sudo tee /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

When this host terminates TLS directly, also open HTTPS in the host firewall:

```bash
sudo firewall-cmd --add-service=https
sudo firewall-cmd --permanent --add-service=https
```

If the site requires a narrower allow-list, add a source-restricted rule
instead of the global HTTPS service. Replace `10.10.1.0/24` with the approved
load-balancer, admin or monitoring subnet:

```bash
HTTPS_SOURCE_CIDR=10.10.1.0/24
FIREWALL_HTTPS_RULE="rule family=\"ipv4\" source address=\"${HTTPS_SOURCE_CIDR}\""
FIREWALL_HTTPS_RULE="${FIREWALL_HTTPS_RULE} service name=\"https\" accept"

sudo firewall-cmd \
  --add-rich-rule="$FIREWALL_HTTPS_RULE"
sudo firewall-cmd \
  --permanent --add-rich-rule="$FIREWALL_HTTPS_RULE"
```

## Install a Release

Download the deployment bundle and checksum from the internal release
repository. Set `RELEASE_DOWNLOAD_URL` to the per-version directory that hosts
the approved release artifacts.

>[!NOTE]
>Sites should use the internal release repository by default. The official
>GitHub release is an explicit opt-in source when that is approved for the
>deployment. GitHub release tags use the `v${VERSION}` path segment.

```bash
VERSION=1.2.3 # Change to the version being deployed.

# Default: internal release repository.
RELEASE_DOWNLOAD_URL="https://release.example.internal/kravhantering/${VERSION}"

# Opt-in: official GitHub release.
# RELEASE_DOWNLOAD_URL="https://github.com/viscalyx/Kravhantering/releases/download/v${VERSION}"

mkdir -p "/tmp/kravhantering-${VERSION}"
cd "/tmp/kravhantering-${VERSION}"

curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz"
curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
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

Label the release-owned nginx configuration files for container bind mounts.
Run this once per installed release:

```bash
sudo chcon -R -t container_file_t \
  "/opt/kravhantering/releases/${VERSION}/nginx"
```

## Image References

Set image references in `/etc/kravhantering/release.env` to the site's
approved runtime refs. Production runtime refs must use tag-style `image:tag`
values. Prefer release-specific internal mirror tags for third-party images.
For connected staging only, derive the public upstream refs from the release
lock and verify them immediately:

```bash
update_ref() {
  sudo sed -i "s#^${1}=.*#${1}=${2}#" /etc/kravhantering/release.env
}

LOCK_FILE=/opt/kravhantering/current/container-stack.lock.json
service_image() {
  jq -r --arg name "$1" \
    '.services[] | select(.name == $name) | .image' "$LOCK_FILE"
}
service_tag() {
  jq -r --arg name "$1" \
    '.services[] | select(.name == $name) | .tag' "$LOCK_FILE"
}
service_ref() {
  printf '%s:%s\n' "$(service_image "$1")" "$(service_tag "$1")"
}

update_ref APP_RUNTIME_IMAGE_REF \
  "$(service_ref app-runtime)"
update_ref DB_JOB_IMAGE_REF \
  "$(service_ref db-job)"
update_ref NGINX_IMAGE_REF \
  "$(service_ref nginx)"
```

If the site pulls from an internal registry mirror that preserves repository
paths, rewrite only the registry host while keeping the locked tags:

```bash
TARGET_IMAGE_REGISTRY=registry.example.internal
LOCK_FILE=/opt/kravhantering/current/container-stack.lock.json
service_image() {
  jq -r --arg name "$1" \
    '.services[] | select(.name == $name) | .image' "$LOCK_FILE"
}
service_tag() {
  jq -r --arg name "$1" \
    '.services[] | select(.name == $name) | .tag' "$LOCK_FILE"
}
mirror_ref() {
  local image
  image="$(service_image "$1")"
  printf '%s/%s:%s\n' \
    "$TARGET_IMAGE_REGISTRY" "${image#*/}" "$(service_tag "$1")"
}

update_ref APP_RUNTIME_IMAGE_REF \
  "$(mirror_ref app-runtime)"
update_ref DB_JOB_IMAGE_REF \
  "$(mirror_ref db-job)"
update_ref NGINX_IMAGE_REF \
  "$(mirror_ref nginx)"
```

If the internal mirror uses a custom repository layout, set the three
`*_IMAGE_REF` values manually to site-approved tag refs, then run the
verification below. Each ref must resolve to the locked `imageId`.

Pull and verify the images as the service user:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

podman pull "$APP_RUNTIME_IMAGE_REF"
podman pull "$DB_JOB_IMAGE_REF"
podman pull "$NGINX_IMAGE_REF"

bin/kravhantering-images.sh --topology app-node \
  --lock-file container-stack.lock.json \
  --env-file /etc/kravhantering/release.env \
  verify

exit
```

Set `NGINX_RESOLVER` in `/etc/kravhantering/release.env` to the Podman DNS
resolver that nginx should use for dynamic `app-runtime` lookups:

```env
NGINX_RESOLVER=10.89.0.1
```

The shown value is the common rootless Podman resolver, not a fixed release
requirement. nginx uses it to re-resolve the upstream app container after
`app-runtime` restarts, instead of keeping a stale container IP. The resolver
can change when the internal Compose network is renamed, recreated or assigned
another subnet. Before starting nginx, run the resolver check below and update
`NGINX_RESOLVER` in `/etc/kravhantering/release.env` to the printed resolver
IP if it differs.

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
DB_CONNECTION_TIMEOUT_MS=15000
DB_REQUEST_TIMEOUT_MS=30000
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

`DB_CONNECTION_TIMEOUT_MS` is the time allowed to open each SQL Server
connection. Raise it when the external database is slow to accept connections
or the network path is occasionally slow. Lower it only if failed connection
attempts should return faster.

`DB_REQUEST_TIMEOUT_MS` is the time allowed for each SQL statement during
migrations and required seed. Raise it when schema changes or seed operations
legitimately take longer on the target database. Lower it only if stuck SQL
statements should fail faster.

Both values are db-job client settings. The shown values match the built-in
defaults and can be kept unless the site needs different timeout limits.

`DB_PASSWORD` in `db-job.env` is the password for the migration/seed login,
normally `kravhantering_job`. The DBA should provision this login with a unique
generated SQL Server password that satisfies the site password policy and does
not contain the login name. Do not reuse the app runtime password.

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

Use the bilingual
[External IdP Handoff](./external-idp-handoff.md) guide as the checklist and
request template when coordinating these values with IdP administrators.

Provision at least one initial application administrator in the IdP before the
first sign-in. This is not an IdP platform administrator account; it is a
normal application user with a real `employeeHsaId` value and the
Kravhantering realm or group roles needed for launch. For the broad bootstrap
case, assign `Reviewer`, `Admin` and `PrivacyOfficer`, then reduce access
through the site's normal identity-governance process if needed.

Set `/etc/kravhantering/app.env`:

```env
NEXT_PUBLIC_SITE_URL=https://kravhantering.example.internal
AUTH_OIDC_ISSUER_URL=https://idp.example.internal/realms/kravhantering
AUTH_OIDC_CLIENT_ID=kravhantering-app
AUTH_OIDC_CLIENT_SECRET=<client-secret>
AUTH_OIDC_REDIRECT_URI=https://kravhantering.example.internal/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=https://kravhantering.example.internal/
AUTH_OIDC_ROLES_CLAIM=roles
AUTH_OIDC_SCOPES=openid profile email
AUTH_OIDC_API_AUDIENCE=kravhantering-app
AUTH_SESSION_COOKIE_NAME=kravhantering_session
AUTH_SESSION_COOKIE_PASSWORD=<at-least-32-random-characters>
AUTH_SESSION_TTL_SECONDS=28800
MCP_CLIENT_ID=kravhantering-mcp
HSA_PERSON_LOOKUP_TIMEOUT_MS=5000
HSA_PERSON_LOOKUP_URL=https://kong.example.internal/hsa/person-records/lookup

NEXT_PUBLIC_DEFAULT_MODEL=
OPENROUTER_API_KEY=
OPENROUTER_MGMT_API_KEY=
```

The app only requires `AUTH_OIDC_CLIENT_SECRET` to be non-empty and to match
the client secret configured in the IdP. For production, use a high-entropy
IdP-generated secret or the fallback in
[Generate Unique Secrets](#generate-unique-secrets).
`AUTH_SESSION_COOKIE_PASSWORD` is separate and must be at least 32 characters.

Keep `AUTH_OIDC_SCOPES=openid profile email` unless the IdP needs additional
scopes to release the required claims. `openid` must always be present. Keep
`AUTH_SESSION_COOKIE_NAME=kravhantering_session` unless this host must serve
another deployment on the same browser cookie scope. Changing the cookie name
signs out existing browser sessions.

Keep `AUTH_SESSION_TTL_SECONDS=28800` for an eight-hour absolute session-cookie
lifetime unless the site has approved another browser-session lifetime. It is
not an idle timeout; the shortest of this value, the IdP SSO session lifetime
and the access-token lifetime controls when the user must re-authenticate.

`MCP_CLIENT_ID=kravhantering-mcp` is used when issuing service-account tokens
for MCP clients. Keep it aligned with the IdP service-account client id, or
leave the default when MCP service tokens are not used. It is not a secret.

Set `HSA_PERSON_LOOKUP_URL` to the environment-specific server-side HSA
lookup endpoint. The browser must not call the HSA integration directly; the
app calls this internal Kong or integration-platform REST facade only when an
editable HSA-id needs lookup or refresh. Keep
`HSA_PERSON_LOOKUP_TIMEOUT_MS=5000` unless the approved integration path needs
another timeout.

Ownership for the optional MCP service-token client is split by responsibility:

- the identity-platform or IdP administration owner issues, rotates and
  revokes the `kravhantering-mcp` confidential client credentials
- the consuming MCP integration owner stores the client secret in its approved
  secret store and updates that client during rotations
- Kravhantering operations approves MCP service-token use per environment,
  records the client id and audience, and verifies that issued tokens work
  against `/api/mcp/*`

Do not store the `kravhantering-mcp` client secret in `app.env`.
`app-runtime` validates signed bearer tokens from the IdP; it does not need the
MCP client secret.

Leave `NEXT_PUBLIC_DEFAULT_MODEL`, `OPENROUTER_API_KEY` and
`OPENROUTER_MGMT_API_KEY` empty unless AI requirement generation is approved
for the environment. To enable AI, set `OPENROUTER_API_KEY` to the approved
OpenRouter API key. `NEXT_PUBLIC_DEFAULT_MODEL` is optional; leave it empty if
the deployment should not preselect a site default model. The UI will use a
saved favorite or the first available model, and backend calls that receive no
model fall back to the built-in default. Set `OPENROUTER_MGMT_API_KEY` only if
the app should display organization credit information.
`NEXT_PUBLIC_DEFAULT_MODEL` is public client configuration; do not put secrets
in it.

For Keycloak, the client must emit the realm roles and `hsaId` user attribute
as the `roles` and `employeeHsaId` claims. The bundle's
`keycloak/realm-kravhantering-production.template.json` shows the expected
mapper shape and declares `hsaId` as a managed Keycloak user-profile
attribute.

### Keycloak Appendix

When the external IdP is Keycloak, create or update a realm with:

- confidential client `kravhantering-app`
- client secret stored only in `/etc/kravhantering/app.env`
- standard authorization code flow enabled
- redirect URI `https://<app-host>/api/auth/callback`
- web origin `https://<app-host>`
- post-logout redirect URI `https://<app-host>/`
- realm roles `Reviewer`, `Admin` and `PrivacyOfficer`
- managed user-profile attribute `hsaId` with administrator view/edit
  permissions
- at least one initial application administrator user with a real `hsaId`
  attribute and the `Reviewer`, `Admin` and `PrivacyOfficer` realm roles
- mapper that emits realm roles as a multivalued `roles` claim
- mapper that emits the user `hsaId` attribute as `employeeHsaId`
- optional service-account client `kravhantering-mcp` with its own generated
  client secret and an audience mapper for `kravhantering-app`

For an already-initialized Keycloak realm, update the user-profile setting
through the Keycloak admin console or admin API. Replacing the realm template
and restarting Keycloak only affects a first import, not a running realm.

Do not import the release-smoke realm into production. The smoke-test realm
contains public test credentials.

## App Node Start Alternatives

Choose exactly one app-node exposure alternative for the host. Use that
alternative's Compose file in the shared `app-runtime` and resolver steps
below, then continue with the matching nginx start instructions. Both app-node
Compose files use the same `kravhantering-internal` network, so the resolver
check is shared. Use only one active app-node Compose stack per host with this
default network name.

Run the common database jobs:

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

exit
```

Start `app-runtime` first. Pick the Compose file for the alternative this host
will use:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml
APP_NODE_NETWORK=kravhantering-internal

podman network exists "$APP_NODE_NETWORK" || \
  podman network create "$APP_NODE_NETWORK"

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d app-runtime

exit
```

Confirm the nginx resolver from inside the same Compose network. The
`APP_NODE_NETWORK` variable is for this temporary `podman run` container;
`podman compose` attaches long-running services to the network automatically.

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

APP_NODE_NETWORK=kravhantering-internal

RESOLVER_IP="$(
  podman run --rm --network "$APP_NODE_NETWORK" --entrypoint /bin/sh \
    "$NGINX_IMAGE_REF" -c \
    "awk '/^nameserver / { print \$2; exit }' /etc/resolv.conf"
)"
printf 'Use NGINX_RESOLVER=%s in /etc/kravhantering/release.env\n' \
  "$RESOLVER_IP"

exit
```

If the printed resolver differs from `NGINX_RESOLVER`, update
`/etc/kravhantering/release.env` to the printed IP before starting nginx:

```bash
# Replace 10.89.1.1 with the printed resolver IP.
RESOLVER_IP=10.89.1.1
sudo sed -i "s#^NGINX_RESOLVER=.*#NGINX_RESOLVER=${RESOLVER_IP}#" \
  /etc/kravhantering/release.env
```

### Alternative A: App Node With TLS on the Node

Use this when the RHEL app node terminates TLS itself.

Install the server certificate and private key:

```bash
sudo install -o root -g kravhantering -m 0640 fullchain.pem \
  /etc/kravhantering/tls/fullchain.pem
sudo install -o root -g kravhantering -m 0640 privkey.pem \
  /etc/kravhantering/tls/privkey.pem
sudo chcon -R -t container_file_t /etc/kravhantering/tls
```

Start the full TLS app node:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d

exit
```

The full start command reads the corrected value from
`/etc/kravhantering/release.env`.

### Alternative B: App Node Behind a TLS-Terminating Load Balancer

Use this when an external load balancer terminates TLS and forwards HTTP to
the app-node nginx. Set the bind address in `/etc/kravhantering/release.env`:

```env
NGINX_HTTP_BIND=127.0.0.1:8080
```

Change the value when the load balancer connects over a dedicated private
network interface, for example `10.10.20.15:8080`.

Start the full HTTP app node:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d

exit
```

The full start command reads the corrected value from
`/etc/kravhantering/release.env`.

The app-facing public URLs in `app.env` must still use the external HTTPS
origin exposed by the load balancer.

After either alternative, check readiness through nginx:

```bash
curl --fail --silent --show-error \
  https://kravhantering.example.internal/api/health
curl --fail --silent --show-error \
  https://kravhantering.example.internal/api/ready
```

If the host uses a self-signed certificate, or the operator workstation does
not yet trust the issuing CA, use `--insecure` for a manual readiness probe
only:

```bash
curl --insecure --fail --silent --show-error \
  https://kravhantering.example.internal/api/health
```

## Operate Individual App-Node Services

Run day-2 service control as the rootless service user from the active release
directory. Use the TLS Compose file unless this node is behind a
TLS-terminating load balancer:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" ps

exit
```

Restart an existing long-running container when only the process needs to
reload mounted files or reconnect to dependencies:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" restart app-runtime
podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" restart nginx

exit
```

Use `restart` for cases such as reloading nginx after replacing mounted TLS
certificate files. Use `up -d --force-recreate SERVICE` instead when an env
file, image ref, bind mount, or Compose definition changed and the container
must be recreated:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d --force-recreate app-runtime
podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d --force-recreate nginx

exit
```

Take down and bring up one service without stopping the whole app node:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" stop nginx
podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d nginx

exit
```

For app maintenance, stop nginx first to stop browser traffic, then stop or
recreate `app-runtime`:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" stop nginx app-runtime
podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d app-runtime nginx

exit
```

Stop and remove both app-node containers only for full-node maintenance:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" down
podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" up -d

exit
```

Do not use `podman compose down -v` in production unless an approved procedure
explicitly calls for deleting Compose-managed volumes. The `db-job` image is
not a long-running service; run database jobs with the documented
`podman run --rm` commands.

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

exit
```

The service runs `podman compose up -d` from `/opt/kravhantering/current` and
`podman compose down` on stop.

## Upgrade And Rollback

Use the standalone
[RHEL 10 production planned-downtime upgrade guide](./rhel10-production-upgrade.md)
to upgrade or roll back the enterprise topology. This deployment guide keeps
the first-install and day-2 app-node operations in one place.

Use
[RHEL 10 production uninstall](./rhel10-production-uninstall.md)
to reverse a first install. Do not use the upgrade rollback checklist as an
uninstall procedure.

## Troubleshooting Readiness

- If `/api/health` works from the host but not from a remote client, check the
  node firewall, load balancer and route rules. When this host terminates TLS,
  HTTPS on port 443 must be allowed from the approved source networks.
- If `/api/health` and `/api/ready` return `502` after restarting
  `app-runtime` on an older release, restart nginx so it resolves the new
  container IP. Current release packages render nginx with `NGINX_RESOLVER`
  and dynamic upstream `resolve` entries to avoid stale upstream IPs.

## Controlled Bootstrap Alternative

When DBA pre-provisioning is not available, `db-job bootstrap` can create the
database and SQL principals with temporary SQL admin credentials. Use this only
as a controlled operational exception:

Validate that SQL Server accepts the bootstrap admin connection before
creating the application database and logins:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
. /etc/kravhantering/db-job.env
set +a

podman run --rm --env-file /etc/kravhantering/db-job.env \
  --env DB_USER="${DB_BOOTSTRAP_ADMIN_USER:-sa}" \
  --env DB_PASSWORD="$DB_BOOTSTRAP_ADMIN_PASSWORD" \
  --env DB_NAME=master \
  "$DB_JOB_IMAGE_REF" wait

exit
```

Then run bootstrap, migration and required seed:

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

exit
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
