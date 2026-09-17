# RHEL 10 Production Uninstall

<!-- cSpell:words readlink userdel -->

This guide describes how to uninstall the enterprise RHEL 10 production
topology after a first install, with external SQL Server and an external IdP.
It is not an upgrade rollback guide. For release rollback after migration, use
[rhel10-production-upgrade.md](./rhel10-production-upgrade.md).

The default flow copies host-side material to an administrator-controlled
staging area, performs culling from that staging copy into a smaller long-term
evidence archive, and then removes the install from the host.

## Before You Start

Confirm these site decisions before removing anything:

- the uninstall window is approved
- browser and API traffic is drained or blocked
- the external SQL Server backup, restore point or retention decision is
  recorded
- the external IdP client, roles and user-retention decision is recorded
- the approved long-term evidence location is ready
- the operator has root access on the RHEL app node
- the `kravhantering` account, its home and Podman storage, the install
  directories, and the managed units belong only to this installation
- any configuration, key material or data required for an approved recovery
  window has a separate verified backup; the evidence archive is not a backup

The commands assume the paths and dedicated account from the production
installation guide. Stop on unexpected command failures and resolve them before
continuing to deletion. Keep the administrator shell open so `STAGING` and
`CURRENT_RELEASE` remain available between sections.

Treat the temporary staging area as sensitive. It may contain env files,
private keys, TLS material, IdP endpoints, internal hostnames and operational
identifiers.

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

Copy the host-side install material before removing it from the host. Confirm
that `CURRENT_RELEASE` resolves under `/opt/kravhantering/releases/`; if the
site uses another location, include that location in staging and adjust the
evidence paths below. The copied `current` symlink still points to the live
release, so evidence collection uses the resolved path within the staging copy:

```bash
sudo cp -a /etc/kravhantering "$STAGING/raw/etc-kravhantering"
sudo cp -a /opt/kravhantering "$STAGING/raw/opt-kravhantering"

CURRENT_RELEASE="$(readlink -f /opt/kravhantering/current)"
printf '%s\n' "$CURRENT_RELEASE" \
  | sudo tee "$STAGING/raw/current-release.txt" >/dev/null
```

## Remove the Independent Cleanup Service First

For full host uninstall, run the retained cleanup manager's `uninstall` command
as the service account before removing application networks, SQL Server or the
service account. Remove its protected configuration and transport artifacts
under site policy. See
[Release-Independent Transient-State Cleanup](transient-state-cleanup.md#full-uninstall).
Application rollback preserves this service and must not follow this step.

## Stop The App Node

Capture status into the restricted staging area from the administrator shell.
An inactive or failed target can return a nonzero status; review that output:

```bash
sudo -iu kravhantering systemctl --user status \
  kravhantering-app-node.target --no-pager 2>&1 \
  | sudo tee "$STAGING/raw/kravhantering-systemd-status.txt" >/dev/null
sudo -iu kravhantering podman ps --all \
  --format '{{.Names}}\t{{.Status}}\t{{.Image}}' \
  | sudo tee "$STAGING/raw/kravhantering-podman-status.txt" >/dev/null
```

Select the installed topology. The helper stops and disables the target,
removes managed unit files, and reloads systemd. It preserves named volumes:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current
TOPOLOGY=app-node-tls
# TOPOLOGY=app-node-http
bin/kravhantering-quadlet.sh remove --topology "$TOPOLOGY"
for purpose in edge egress; do
  NETWORK="$(
    bin/kravhantering-quadlet.sh print-network \
      --topology "$TOPOLOGY" --purpose "$purpose"
  )"
  podman network exists "$NETWORK" && podman network rm "$NETWORK"
done

exit
```

## Cull Long-Term Evidence

Copy only approved evidence from the sensitive raw staging copy into the
long-term evidence directory:

```bash
RELEASE_SUBPATH="${CURRENT_RELEASE#/opt/kravhantering/}"
STAGED_RELEASE="$STAGING/raw/opt-kravhantering/$RELEASE_SUBPATH"
sudo cp "$STAGED_RELEASE/DEPLOYMENT-MANIFEST.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/container-stack.lock.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/public/build.json" "$STAGING/evidence/"
sudo cp "$STAGED_RELEASE/release-metadata.json" "$STAGING/evidence/"

sudo grep -E '^(APP_RUNTIME_IMAGE_REF|DB_JOB_IMAGE_REF|NGINX_IMAGE_REF)=' \
  "$STAGING/raw/etc-kravhantering/release.env" \
  | sudo tee "$STAGING/evidence/image-refs.env" >/dev/null

sudo grep -E \
  '^(NEXT_PUBLIC_SITE_URL|AUTH_OIDC_ISSUER_URL|AUTH_OIDC_CLIENT_ID)=' \
  "$STAGING/raw/etc-kravhantering/app.env" \
  | sudo tee "$STAGING/evidence/sanitized-app-summary.env" >/dev/null

sudo cp "$STAGING/raw/current-release.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/kravhantering-systemd-status.txt" "$STAGING/evidence/"
sudo cp "$STAGING/raw/kravhantering-podman-status.txt" "$STAGING/evidence/"
```

Review the evidence directory before archiving. Do not include raw env files,
private keys, full TLS material or raw container inspect output in the
long-term evidence archive unless the site's records policy explicitly
requires it.

Create the long-term archive and move it to the approved evidence store:

```bash
sudo tar -C "$STAGING" -czf \
  "$STAGING/kravhantering-uninstall-evidence-${UNINSTALL_ID}.tar.gz" \
  evidence
```

After the approved evidence archive has been copied and verified, delete the
temporary staging area:

```bash
sudo rm -rf -- "${STAGING:?}"
```

## Remove Host Install

Remove the host-side configuration and release files:

```bash
sudo rm -rf /etc/kravhantering
sudo rm -rf /opt/kravhantering
```

Remove the dedicated rootless service user and its home directory only after
confirming that no retained data or unrelated containers remain in its Podman
storage. Storage under the home directory is deleted with the account; retire
any separately configured container storage under the site's storage procedure:

```bash
sudo loginctl disable-linger kravhantering
sudo userdel -r kravhantering
```

Remove host changes only if they were created solely for this installation:

```bash
sudo rm -f /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

Deleting a sysctl file does not itself restore the live kernel value. Restore
`net.ipv4.ip_unprivileged_port_start` to the recorded pre-install or approved
host-policy value if no remaining configuration sets it.

If the host firewall rule was added only for this app node, remove that rule
with the site's approved `firewall-cmd` procedure.

## External Systems

The uninstall does not delete external SQL Server or external IdP assets.
Close those records through the site-owned procedures:

- archive, retain or delete the external SQL Server database
- remove SQL logins and users if the database is retired
- remove or disable the IdP client registration
- remove application roles and service accounts if they are no longer shared
- revoke OIDC and optional MCP client secrets, and delete app-specific
  secret-manager entries such as the session-cookie password after the approved
  rollback or reinstall window has passed
- remove load-balancer, DNS and monitoring entries for the app node

Record those external decisions next to the uninstall evidence archive.
