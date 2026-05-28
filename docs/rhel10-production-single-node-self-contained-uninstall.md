# RHEL 10 Self-Contained Single-Node Uninstall

<!-- cSpell:words Mountpoint mountpoints readlink userdel -->

This guide describes how to uninstall the self-contained single-node RHEL 10
topology after a first install, with nginx, `app-runtime`, SQL Server,
Keycloak and `db-job` in one rootless Podman Compose network. It is not an
upgrade rollback guide. For release rollback after migration, use
[rhel10-production-single-node-self-contained-upgrade.md](./rhel10-production-single-node-self-contained-upgrade.md).

The default flow copies host-side material to an administrator-controlled
staging area, performs culling from that staging copy into a smaller long-term
evidence archive, and then removes the install from the host.

Best-effort file archives are not a tested SQL Server backup, volume snapshot
or Keycloak restore procedure. If the environment contains data that must be
restorable, complete the site-approved backup or snapshot procedure before
following this guide.

## Before You Start

Confirm these site decisions before removing anything:

- the uninstall window is approved
- browser traffic is drained or blocked
- the SQL Server backup, volume snapshot or data-retention decision is recorded
- the Keycloak user, realm and data-retention decision is recorded
- enough administrator-controlled storage exists for the raw staging copy
- the approved long-term evidence location is ready
- the operator has root access on the RHEL host

Treat the temporary staging area as sensitive. It may contain env files,
private keys, SQL Server files, Keycloak files, TLS material, internal
hostnames and operational identifiers.

## Optional Demo Cleanup

Run this section only for disposable test or development deployments where demo
data was intentionally added. Keep SQL Server and Keycloak running until these
commands finish.

Clear SQL Server demo data. This deletes all non-required application rows,
preserving only required system and lookup seed data:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

STACK_NETWORK=kravhantering-single-node_kravhantering-internal

podman run --rm --network "$STACK_NETWORK" \
  --env-file /etc/kravhantering/db-job.env \
  "$DB_JOB_IMAGE_REF" demo:clear --confirm-clear-non-required-data

exit
```

Delete marked Keycloak demo users from the running Keycloak realm:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

STACK_NETWORK=kravhantering-single-node_kravhantering-internal
SCRIPT_FILE=$PWD/scripts/keycloak-demo-users.mjs
SCRIPT_TARGET=/workspace/scripts/keycloak-demo-users.mjs

podman run --rm --pull=never --network "$STACK_NETWORK" \
  --entrypoint node --user 0:0 \
  --env-file /etc/kravhantering/keycloak.env \
  --volume "$SCRIPT_FILE:$SCRIPT_TARGET:ro" \
  "$DB_JOB_IMAGE_REF" \
  "$SCRIPT_TARGET" demo-users:clear \
  --confirm-clear-demo-users \
  --base-url http://keycloak:8080 \
  --realm kravhantering-production

exit
```

## Stop The Stack

Disable the optional user-systemd wrapper if it was installed:

```bash
sudo -iu kravhantering
systemctl --user disable --now kravhantering-compose.service
exit
```

Stop and remove the rootless long-running containers without deleting volumes:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current

podman compose --env-file /etc/kravhantering/release.env \
  -f compose/single-node.compose.yml down

exit
```

Do not run `podman compose down -v` here. The rootless volume files are copied
from the service user's home in the staging step below.

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

Copy the host-side install material before removing it from the host. The
service user's home can be large because it normally contains the rootless
Podman storage for SQL Server and Keycloak volumes:

```bash
sudo cp -a /etc/kravhantering "$STAGING/raw/etc-kravhantering"
sudo cp -a /opt/kravhantering "$STAGING/raw/opt-kravhantering"
sudo cp -a /home/kravhantering "$STAGING/raw/home-kravhantering"

CURRENT_RELEASE="$(readlink -f /opt/kravhantering/current)"
printf '%s\n' "$CURRENT_RELEASE" \
  | sudo tee "$STAGING/raw/current-release.txt" >/dev/null
```

Capture the known rootless volume mount points and final service status:

```bash
sudo -iu kravhantering bash -lc '
  podman volume inspect kravhantering-sqlserver-data \
    --format "{{ .Mountpoint }}"
  podman volume inspect kravhantering-keycloak-data \
    --format "{{ .Mountpoint }}"
' | sudo tee "$STAGING/raw/podman-volume-mountpoints.txt" >/dev/null

sudo -iu kravhantering bash -lc '
  cd /opt/kravhantering/current
  podman compose --env-file /etc/kravhantering/release.env \
    -f compose/single-node.compose.yml ps
' | sudo tee "$STAGING/raw/podman-compose-ps.txt" >/dev/null
```

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
grep -E '^(SQLSERVER_IMAGE_REF|KEYCLOAK_IMAGE_REF)=' \
  /etc/kravhantering/release.env \
  | sudo tee -a "$STAGING/evidence/image-refs.env" >/dev/null

grep -E '^(NEXT_PUBLIC_SITE_URL|AUTH_OIDC_ISSUER_URL|AUTH_OIDC_CLIENT_ID)=' \
  /etc/kravhantering/app.env \
  | sudo tee "$STAGING/evidence/sanitized-app-summary.env" >/dev/null

sudo cp "$STAGING/raw/current-release.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/podman-volume-mountpoints.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/podman-compose-ps.txt" "$STAGING/evidence/"
```

Review the evidence directory before archiving. Do not include raw env files,
private keys, full TLS material, SQL Server volume files, Keycloak volume files
or raw container inspect output in the long-term evidence archive unless the
site's records policy explicitly requires it.

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

Remove the rootless service user and its home directory. This removes the
normal rootless Podman storage location, including the SQL Server and Keycloak
volume files that were copied into the sensitive raw staging area earlier:

```bash
sudo loginctl disable-linger kravhantering
sudo userdel -r kravhantering
```

Remove host changes only if they were created solely for this installation:

```bash
sudo rm -f /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

If the host firewall rule was added only for this stack, remove that rule with
the site's approved `firewall-cmd` procedure.

If Appendix A's local root CA was installed only for this host, remove it from
the RHEL trust store and rebuild trust:

```bash
sudo rm -f \
  /etc/pki/ca-trust/source/anchors/kravhantering-local-root-ca.crt
sudo update-ca-trust extract
```

## External Records

Close remaining records through the site-owned procedures:

- remove load-balancer, DNS and monitoring entries
- record the SQL Server backup, volume snapshot or purge decision
- record the Keycloak realm, user and client retention decision
- record where the long-term uninstall evidence archive was stored
