# RHEL 10 Production Uninstall

<!-- cSpell:words readlink userdel -->

This guide describes how to uninstall the enterprise RHEL 10 production
topology after a first install, with external SQL Server and an external IdP.
It is not an upgrade rollback guide. For release rollback after migration, use
[rhel10-production-upgrade.md](./rhel10-production-upgrade.md).

The default flow copies host-side material to an administrator-controlled
staging area, performs gallring from that staging copy into a smaller long-term
evidence archive, and then removes the install from the host.

## Before You Start

Confirm these site decisions before removing anything:

- the uninstall window is approved
- browser traffic is drained or blocked
- the external SQL Server backup, restore point or retention decision is
  recorded
- the external IdP client, roles and user-retention decision is recorded
- the approved long-term evidence location is ready
- the operator has root access on the RHEL app node

Treat the temporary staging area as sensitive. It may contain env files,
private keys, TLS material, IdP endpoints, internal hostnames and operational
identifiers.

## Optional Demo Cleanup

Run this section only for disposable test or development deployments where demo
data was intentionally added.

Clear SQL Server demo data with the `db-job` image. This deletes all
non-required application rows, preserving only required system and lookup seed
data:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

podman run --rm --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" demo:clear --confirm-clear-non-required-data

exit
```

If the external IdP is Keycloak and marked demo users were synced into the
running Keycloak realm, delete only those marked demo users. Use approved
Keycloak administrator credentials for `KEYCLOAK_ADMIN` and
`KEYCLOAK_ADMIN_PASSWORD`:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

SCRIPT_FILE=$PWD/scripts/keycloak-demo-users.mjs
SCRIPT_TARGET=/workspace/scripts/keycloak-demo-users.mjs

podman run --rm --pull=never --entrypoint node \
  --env KEYCLOAK_ADMIN="<keycloak-admin-user>" \
  --env KEYCLOAK_ADMIN_PASSWORD="<keycloak-admin-password>" \
  --volume "$SCRIPT_FILE:$SCRIPT_TARGET:ro" \
  "$DB_JOB_IMAGE_REF" \
  "$SCRIPT_TARGET" demo-users:clear \
  --confirm-clear-demo-users \
  --base-url https://idp.example.internal \
  --realm kravhantering-production

exit
```

For a non-Keycloak IdP, remove demo users through the site's approved identity
administration procedure.

## Stop The App Node

Disable the optional user-systemd wrapper if it was installed:

```bash
sudo -iu kravhantering
systemctl --user disable --now kravhantering-compose.service
exit
```

Stop and remove the rootless app-node containers. Use the TLS Compose file
unless this node is behind a TLS-terminating load balancer:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
COMPOSE_FILE=compose/app-node-tls.compose.yml
# COMPOSE_FILE=compose/app-node-http.compose.yml

podman compose --env-file /etc/kravhantering/release.env \
  -f "$COMPOSE_FILE" down

exit
```

## Stage Raw Material

Create a restricted staging area. Keep it on storage controlled by the
administrator, not in a shared evidence repository:

```bash
UNINSTALL_ID="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="/var/tmp/kravhantering-uninstall-${UNINSTALL_ID}"

sudo install -d -o root -g root -m 0700 "$STAGING"
sudo install -d -o root -g root -m 0700 "$STAGING/raw"
sudo install -d -o root -g root -m 0700 "$STAGING/evidence"
```

Copy the host-side install material before removing it from the host:

```bash
sudo cp -a /etc/kravhantering "$STAGING/raw/etc-kravhantering"
sudo cp -a /opt/kravhantering "$STAGING/raw/opt-kravhantering"

CURRENT_RELEASE="$(readlink -f /opt/kravhantering/current)"
printf '%s\n' "$CURRENT_RELEASE" \
  | sudo tee "$STAGING/raw/current-release.txt" >/dev/null
```

Capture operational command output:

```bash
sudo -iu kravhantering bash -lc '
  cd /opt/kravhantering/current
  COMPOSE_FILE=compose/app-node-tls.compose.yml
  podman compose --env-file /etc/kravhantering/release.env \
    -f "$COMPOSE_FILE" ps
' | sudo tee "$STAGING/raw/podman-compose-ps.txt" >/dev/null
```

If this node used the HTTP Compose file, rerun the capture with
`COMPOSE_FILE=compose/app-node-http.compose.yml`.

## Cull Long-Term Evidence

Copy only approved evidence from the sensitive raw staging copy into the
long-term evidence directory:

```bash
sudo cp "$CURRENT_RELEASE/DEPLOYMENT-MANIFEST.json" "$STAGING/evidence/"
sudo cp "$CURRENT_RELEASE/container-stack.lock.json" "$STAGING/evidence/"
sudo cp "$CURRENT_RELEASE/public/build.json" "$STAGING/evidence/"
sudo cp "$CURRENT_RELEASE/release-metadata.json" "$STAGING/evidence/"

grep -E '^(APP_RUNTIME_IMAGE_REF|DB_JOB_IMAGE_REF|NGINX_IMAGE_REF)=' \
  /etc/kravhantering/release.env \
  | sudo tee "$STAGING/evidence/image-refs.env" >/dev/null

grep -E '^(NEXT_PUBLIC_SITE_URL|AUTH_OIDC_ISSUER_URL|AUTH_OIDC_CLIENT_ID)=' \
  /etc/kravhantering/app.env \
  | sudo tee "$STAGING/evidence/sanitized-app-summary.env" >/dev/null

sudo cp "$STAGING/raw/current-release.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/podman-compose-ps.txt" "$STAGING/evidence/"
```

Review the evidence directory before archiving. Do not include raw env files,
private keys, full TLS material or raw container inspect output in the
long-term evidence archive unless the site's records policy explicitly
requires it.

Create the long-term archive and move it to the approved evidence store:

```bash
sudo tar -C "$STAGING" -czf \
  "/var/tmp/kravhantering-uninstall-evidence-${UNINSTALL_ID}.tar.gz" \
  evidence
```

After the approved evidence archive has been copied and verified, delete the
temporary staging area:

```bash
sudo rm -rf "$STAGING"
```

## Remove Host Install

Remove the host-side configuration and release files:

```bash
sudo rm -rf /etc/kravhantering
sudo rm -rf /opt/kravhantering
```

Remove the rootless service user and its home directory:

```bash
sudo loginctl disable-linger kravhantering
sudo userdel -r kravhantering
```

Remove host changes only if they were created solely for this installation:

```bash
sudo rm -f /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

If the host firewall rule was added only for this app node, remove that rule
with the site's approved `firewall-cmd` procedure.

## External Systems

The uninstall does not delete external SQL Server or external IdP assets.
Close those records through the site-owned procedures:

- archive, retain or delete the external SQL Server database
- remove SQL logins and users if the database is retired
- remove or disable the IdP client registration
- remove application roles and service accounts if they are no longer shared
- remove load-balancer, DNS and monitoring entries for the app node

Record those external decisions next to the uninstall evidence archive.
