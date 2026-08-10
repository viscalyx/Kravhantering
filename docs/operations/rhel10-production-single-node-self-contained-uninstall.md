# RHEL 10 Self-Contained Single-Node Uninstall

<!-- cSpell:words Mountpoint mountpoints readlink userdel -->

This guide describes how to uninstall the self-contained single-node RHEL 10
topology after a first install, with nginx, `app-runtime`, SQL Server,
Keycloak and explicit `db-job` operations in one rootless Quadlet network. It
is not an upgrade rollback guide. For release rollback after migration, use
[rhel10-production-single-node-self-contained-upgrade.md](./rhel10-production-single-node-self-contained-upgrade.md).

Record `IDENTITY_PROVIDER_MODE` before removal. The `external` profile has no
bundled Keycloak container, volume, identity network or management TLS files;
coordinate client-registration and secret revocation with the external
provider owner. For `hardened-bundled`, revoke management client certificates,
remove the management-only DNS and firewall route, and record whether Keycloak
data and backups are retained or destroyed. The test-oriented `bundled`
profile may contain disposable identities, but deletion still requires the
recorded retention decision.

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
- for bundled profiles, the Keycloak user, realm and data-retention decision
  is recorded; for `external`, provider-side client and secret revocation is
  recorded instead
- enough administrator-controlled storage exists for the raw staging copy
- the approved long-term evidence location is ready
- the operator has root access on the RHEL host

Treat the temporary staging area as sensitive. It may contain env files,
private keys, SQL Server files, Keycloak files, TLS material, internal
hostnames and operational identifiers.

## Optional Demo Cleanup

Run this section only for disposable test or development deployments where demo
data was intentionally added. Keep SQL Server running until these commands
finish. For the test-oriented `bundled` profile, also keep Keycloak running
until its demo-user cleanup finishes.

Clear SQL Server demo data with the optional `kravhantering-demo-seed` image
from the release notes or your internal mirror. This deletes all non-required
application rows, preserving only required system and lookup seed data:

The `STACK_NETWORK` variable is for temporary `podman run` containers that
need internal service-name DNS such as `keycloak` or `sqlserver`. Resolve the
stable Quadlet network name through the helper.

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

STACK_NETWORK="$(
  bin/kravhantering-quadlet.sh print-network \
    --topology single-node --purpose database
)"
DB_CA_SOURCE=/etc/kravhantering/tls/ca.crt
DB_CA_TARGET=/run/kravhantering/sqlserver-ca.crt
DEMO_SEED_IMAGE_REF=ghcr.io/viscalyx/kravhantering-demo-seed:replace-with-release-tag

podman pull "$DEMO_SEED_IMAGE_REF"

podman run --rm --network "$STACK_NETWORK" \
  --env-file /etc/kravhantering/db-job.env \
  --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
  "$DEMO_SEED_IMAGE_REF" demo:clear --confirm-clear-non-required-data

exit
```

For the test-oriented `bundled` profile only, delete marked Keycloak demo users
from the running Keycloak realm. Skip this entire block for `external` and
`hardened-bundled`:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
set -a
. /etc/kravhantering/release.env
set +a

STACK_NETWORK="$(
  bin/kravhantering-quadlet.sh print-network \
    --topology single-node --purpose identity
)"
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

Capture systemd and Podman status before shutdown, then stop the target and
remove only the managed Quadlet files:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
systemctl --user status kravhantering-single-node.target --no-pager \
  > /var/tmp/kravhantering-systemd-status.txt 2>&1 || true
podman ps --all --format '{{.Names}}\t{{.Status}}\t{{.Image}}' \
  > /var/tmp/kravhantering-podman-status.txt
systemctl --user disable --now kravhantering-single-node.target
bin/kravhantering-quadlet.sh remove --topology single-node
systemctl --user daemon-reload
for purpose in edge identity database egress; do
  NETWORK="$(
    bin/kravhantering-quadlet.sh print-network \
      --topology single-node --purpose "$purpose"
  )"
  podman network exists "$NETWORK" && podman network rm "$NETWORK"
done

exit
```

The helper never deletes `kravhantering-sqlserver-data` or, for bundled
profiles, `kravhantering-keycloak-data`. The rootless volume files are copied
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
service user's home can be large because it contains rootless Podman storage
for SQL Server and, in bundled profiles, Keycloak volumes:

```bash
sudo cp -a /etc/kravhantering "$STAGING/raw/etc-kravhantering"
sudo cp -a /opt/kravhantering "$STAGING/raw/opt-kravhantering"
sudo cp -a /home/kravhantering "$STAGING/raw/home-kravhantering"

CURRENT_RELEASE="$(readlink -f /opt/kravhantering/current)"
printf '%s\n' "$CURRENT_RELEASE" \
  | sudo tee "$STAGING/raw/current-release.txt" >/dev/null
```

Capture the known rootless volume mount points and copy the pre-shutdown
service status:

```bash
sudo -iu kravhantering bash -lc '
  podman volume inspect kravhantering-sqlserver-data \
    --format "{{ .Mountpoint }}"
  if podman volume exists kravhantering-keycloak-data; then
    podman volume inspect kravhantering-keycloak-data \
      --format "{{ .Mountpoint }}"
  fi
' | sudo tee "$STAGING/raw/podman-volume-mountpoints.txt" >/dev/null

sudo cp /var/tmp/kravhantering-systemd-status.txt "$STAGING/raw/"
sudo cp /var/tmp/kravhantering-podman-status.txt "$STAGING/raw/"
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
grep -E '^SQLSERVER_IMAGE_REF=' \
  /etc/kravhantering/release.env \
  | sudo tee -a "$STAGING/evidence/image-refs.env" >/dev/null
if ! grep -q '^IDENTITY_PROVIDER_MODE=external$' \
  /etc/kravhantering/release.env; then
  grep -E '^KEYCLOAK_IMAGE_REF=' /etc/kravhantering/release.env \
    | sudo tee -a "$STAGING/evidence/image-refs.env" >/dev/null
fi

grep -E '^(NEXT_PUBLIC_SITE_URL|AUTH_OIDC_ISSUER_URL|AUTH_OIDC_CLIENT_ID)=' \
  /etc/kravhantering/app.env \
  | sudo tee "$STAGING/evidence/sanitized-app-summary.env" >/dev/null

sudo cp "$STAGING/raw/current-release.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/podman-volume-mountpoints.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/kravhantering-systemd-status.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/kravhantering-podman-status.txt" "$STAGING/evidence/"
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
sudo rm -f /var/tmp/kravhantering-systemd-status.txt
sudo rm -f /var/tmp/kravhantering-podman-status.txt
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
- for bundled profiles, record the Keycloak realm, user and client retention
  decision; for `external`, record provider-side client and secret revocation
- record where the long-term uninstall evidence archive was stored
