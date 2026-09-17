# RHEL 10 Self-Contained Single-Node Uninstall

<!-- cSpell:words Mountpoint mountpoints readlink userdel -->

This guide describes how to uninstall the self-contained single-node RHEL 10
topology from a RHEL host. It covers nginx, `app-runtime`, SQL Server,
optional bundled Keycloak and their rootless Quadlet networks. It is for
operators permanently removing the installation, not rolling back a release.
For release rollback after migration, use
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
- required backups and recovery secrets are verified in approved storage outside
  `/etc/kravhantering`, `/opt/kravhantering`, the service user's home and the
  temporary staging area
- for bundled profiles, the Keycloak user, realm and data-retention decision
  is recorded; for `external`, provider-side client and secret revocation is
  recorded instead
- enough administrator-controlled storage exists for the raw staging copy
- the approved long-term evidence location is ready
- the operator has root access on the RHEL host

Treat the temporary staging area as sensitive. It may contain env files,
private keys, SQL Server files, Keycloak files, TLS material, internal
hostnames and operational identifiers.

## Remove the Independent Cleanup Service First

For full host uninstall, run the retained cleanup manager's `uninstall` command
as the service account before removing application networks, SQL Server or the
service account. Remove its protected configuration and transport artifacts
under site policy. See
[Release-Independent Transient-State Cleanup](transient-state-cleanup.md#full-uninstall).
Application rollback preserves this service and must not follow this step.

## Stop The Stack

Run the administrator commands from the same shell so staging variables remain
available. Each `sudo -iu kravhantering` block enters a service-account shell;
`exit` returns to the administrator shell.

Capture systemd and Podman status before shutdown, then use the helper to stop
and disable the target and remove the managed Quadlet files:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
systemctl --user status kravhantering-single-node.target --no-pager \
  > /var/tmp/kravhantering-systemd-status.txt 2>&1 || true
podman ps --all --format '{{.Names}}\t{{.Status}}\t{{.Image}}' \
  > /var/tmp/kravhantering-podman-status.txt
bin/kravhantering-quadlet.sh remove --topology single-node
for purpose in edge identity database egress; do
  NETWORK="$(
    bin/kravhantering-quadlet.sh print-network \
      --topology single-node --purpose "$purpose"
  )"
  if podman network exists "$NETWORK"; then
    podman network rm "$NETWORK"
  fi
done

exit
```

Resolve any stop or network-removal failure before continuing. Confirm no
application or one-shot database containers remain running with
`podman ps` as the service account.

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
for SQL Server and, in bundled profiles, Keycloak volumes. If Podman storage
or bind-mounted data lives outside these paths, stage it separately under the
same retention policy:

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
long-term evidence directory. The release path below assumes the installation
uses `/opt/kravhantering/releases`; adjust it if the recorded release path
points elsewhere. Omit any unused Keycloak image reference for `external`:

```bash
RELEASE_RELATIVE="${CURRENT_RELEASE#/opt/kravhantering/}"
STAGED_RELEASE="$STAGING/raw/opt-kravhantering/$RELEASE_RELATIVE"
sudo cp "$STAGED_RELEASE/DEPLOYMENT-MANIFEST.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/container-stack.lock.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/public/build.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/release-metadata.json" "$STAGING/evidence/"

sudo grep -E \
  -e '^(IDENTITY_PROVIDER_MODE|APP_RUNTIME_IMAGE_REF|DB_JOB_IMAGE_REF)=' \
  -e '^(NGINX_IMAGE_REF|SQLSERVER_IMAGE_REF|KEYCLOAK_IMAGE_REF)=' \
  "$STAGING/raw/etc-kravhantering/release.env" \
  | sudo tee "$STAGING/evidence/image-refs.env" >/dev/null

sudo grep -E \
  '^(NEXT_PUBLIC_SITE_URL|AUTH_OIDC_ISSUER_URL|AUTH_OIDC_CLIENT_ID)=' \
  "$STAGING/raw/etc-kravhantering/app.env" \
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
  "$STAGING/kravhantering-uninstall-evidence-${UNINSTALL_ID}.tar.gz" \
  evidence
```

Stop if any staging or archive command fails. Copy the archive to the approved
evidence store and verify that copy before continuing. Verify required backups
and recovery secrets separately: the evidence archive does not contain them.
Only then delete the temporary staging area, including its raw volume copies:

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
volume files. The raw staging copies are also deleted by the preceding step;
only separately retained backups and evidence survive. Close all remaining
service-account sessions before deleting the account:

```bash
sudo loginctl disable-linger kravhantering
sudo loginctl terminate-user kravhantering
sudo userdel -r kravhantering
```

Remove host changes only if they were created solely for this installation:

```bash
sudo rm -f /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

If the host firewall rule was added only for this stack, remove that rule with
the site's approved `firewall-cmd` procedure.

If the deployment guide's optional local root CA was installed only for this
installation, remove it from the RHEL trust store and rebuild trust:

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
