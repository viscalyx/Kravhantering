# RHEL 10 Self-Contained Single-Node Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the self-contained
single-node RHEL 10 production topology from released artifacts, with nginx,
`app-runtime`, SQL Server and Keycloak as rootless Podman Quadlet services.
`db-job` remains an explicit release operation on the same network.

Before the downtime window, confirm the target images' CPU requirements in
[Host prerequisites](production-quadlet-containment.md#host-prerequisites).
The UBI 10 application and database-job images require x86-64-v3, including
the CPU presented to a virtual machine.

Before the change, read `IDENTITY_PROVIDER_MODE` from
`/etc/kravhantering/release.env` and record it in the change ticket:

- `bundled` is an explicit test-oriented choice; do not relabel it as production
  hardened during an upgrade.
- `external` has no bundled Keycloak unit, image, identity network or volume.
  Skip Keycloak image, backup and recovery steps and coordinate
  provider changes with its deployer.
- `hardened-bundled` must preserve the management bind, mTLS certificates,
  `KC_HOSTNAME_ADMIN`, user-facing deny rules, named MFA administrators and
  retired bootstrap identity. Follow the
  [production-hardening appendix](./rhel10-production-single-node-self-contained-deploy.md#appendix-c-production-hardened-bundled-keycloak)
  before and after upgrade or rollback.

## Identity Profile Upgrade Impact

Explicitly supply `IDENTITY_PROVIDER_MODE` in `release.env` and
`KRAVHANTERING_DEPLOYMENT_ENVIRONMENT` in `app.env`.
Use `prodlike` or `staging` only for the corresponding non-production
environment. Production requires `external` or fully configured
`hardened-bundled`; no automatic identity or data conversion takes place.

The target release's `render`, `install`, and `verify-host` reject missing,
blank, or unsupported choices and production with `bundled` before changing
installed resources. Fix the named setting in the indicated file and retry;
a shell or `release.env` environment override cannot authorize `bundled` for
production. Status, network diagnostics and removal do not require these
choices. Preserve these explicit settings during rollback as well.

>[!IMPORTANT]
>The current Quadlet helper still requires `KEYCLOAK_ADMIN` and
>`KEYCLOAK_ADMIN_PASSWORD` in `keycloak.env` for both bundled profiles during
>`render`, `install`, and `verify-host`. After bootstrap credential removal,
>a `hardened-bundled` deployment cannot pass these checks. Resolve this helper
>limitation in the target release before scheduling downtime; do not restore
>retired credentials or weaken the identity profile to bypass it. Verify that
>the selected rollback release also supports the retired-bootstrap state.

For `hardened-bundled`, back up Keycloak data and configuration before the
upgrade and verify public denial before upstream selection, management-only
mTLS console/API access and browser login/logout after the change. A rollback
must restore the previous Keycloak image, compatible data, nginx profile and
management certificate configuration as one tested set.

For a first install, use
[rhel10-production-single-node-self-contained-deploy.md](./rhel10-production-single-node-self-contained-deploy.md).
For the enterprise topology with external SQL Server and external IdP, use
[rhel10-production-upgrade.md](./rhel10-production-upgrade.md).
To uninstall a first install, use
[rhel10-production-single-node-self-contained-uninstall.md](./rhel10-production-single-node-self-contained-uninstall.md).

>[!IMPORTANT]
>For disconnected upgrades, first follow
>[rhel10-production-single-node-self-contained-disconnected.md](./rhel10-production-single-node-self-contained-disconnected.md).
>The disconnected guide prepares the transferable bundle before the downtime
>window and tells you which connected artifact and image steps it replaces on
>the disconnected host.

## Planned-Downtime Upgrade

Use planned downtime unless a future release explicitly documents rolling
compatibility. Keep the existing `/etc/kravhantering/*.env` files and realm
JSON during upgrade. The first-install template-copy steps are intentionally
not part of this checklist unless the release notes require a specific
configuration change.

The HSA verification quota uses the bundled SQL Server. Stop the complete
single-node target, apply the migration and runtime-permission reconciliation,
and then start an app release that implements the shared quota. No new service,
secret or operator setting is required.

>[!IMPORTANT]
>Before the downtime window, create the mandatory site-specific
>[readiness probe boundary](./readiness-probe-boundary.md) and add its path to
>`/etc/kravhantering/release.env`. The target release refuses to render or
>install every identity-provider profile without this file. Verify readiness
>from an allowed monitoring source and denial from another source after
>rollout.

When the target release enables connection-managed AI, provision and back up
the external provider-secret root keyring before migration. Keep every version
referenced by current rows or retained database backups, mount it read-only,
and test database plus keyring restore as one recovery set. Follow
[AI Connections Operations](./ai-connections.md); do not put root keys in
`app.env` or release artifacts.

Before downtime, complete the compatibility and recovery-set preflight in
[Release-Independent Transient-State Cleanup](transient-state-cleanup.md#upgrade-rollback-and-recovery-set).
Retain the compatible cleanup release, image and configuration independently of
both application releases. Pause its manager after traffic is drained and
before any persistent-state change; resume it successfully before reopening
traffic.

### Identity Resolver Prerequisite

After configuring the explicit identity profile choices above, add a temporary
resolver value if a bundled profile lacks `NGINX_IDENTITY_RESOLVER`. The target
helper requires this setting for the preflight in step 3:

```bash
if ! sudo grep -q '^IDENTITY_PROVIDER_MODE=external$' \
  /etc/kravhantering/release.env && \
  ! sudo grep -q '^NGINX_IDENTITY_RESOLVER=' \
    /etc/kravhantering/release.env; then
  printf '%s\n' 'NGINX_IDENTITY_RESOLVER=10.89.1.1' |
    sudo tee -a /etc/kravhantering/release.env >/dev/null
fi
```

Only this resolver setup moves ahead of preflight. Do not run step 8's
installation, database-job, or migration commands until that step. Do not
restart nginx with the temporary value: resolver discovery in step 8 replaces
it before the new stack starts.

### Upgrade Steps

1. Confirm the target release bundle, checksum and locked image identities.
   Download the target bundle and checksum from the approved release source:

   ```bash
   VERSION=1.2.4 # Change to the version being deployed.

   # Default: internal release repository.
   RELEASE_DOWNLOAD_URL="https://release.example.internal/kravhantering/${VERSION}"

   # Opt-in: official GitHub release artifact.
   # RELEASE_DOWNLOAD_URL="https://github.com/viscalyx/Kravhantering/releases/download/v${VERSION}"

   mkdir -p "/tmp/kravhantering-${VERSION}"
   cd "/tmp/kravhantering-${VERSION}"

   curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz"
   curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
   curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz.sigstore.json"
   curl -fLO "${RELEASE_DOWNLOAD_URL}/kravhantering-production-deploy-${VERSION}.tar.gz.trusted-root.jsonl"
   curl -fLO "${RELEASE_DOWNLOAD_URL}/container-stack.lock.json"
   sha256sum -c "kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
   jq -r '
     .services[]
     | "\(.name) manifest=\(.manifestDigest) imageId=\(.imageId)"
   ' container-stack.lock.json
   ```

   Verify provenance before the extraction in step 5 by following
   [Verify The Deployment Archive](./release-artifact-and-image-verification.md#verify-the-deployment-archive).
   Use the exact source commit, source ref, and release tag from the GitHub
   Release notes or approved internal release record. This check must succeed
   before extraction. The required SHA-256 check above remains a separate
   transfer-integrity control.

   Ensure the site has approved tag-style image refs for every single-node
   image named in the target release lock. Each configured ref must resolve to
   the locked `imageId`. The helper also accepts `image:tag@sha256:digest` refs
   when a site explicitly requires pull-time digest pinning.

2. Confirm a tested SQL Server backup, volume snapshot or restore point.
   Test the site-approved restore procedure before the window begins and
   record the backup, snapshot or restore-point identifier. Preserve the
   previous release's configuration alongside it, including `release.env`,
   application and database-job settings, TLS material, and, for bundled
   profiles, Keycloak data, realm configuration and management certificates.
   Do not continue unless the restore point covers the database state before
   any target-release migration runs.

3. Before draining traffic, complete the extraction and review in step 5
   without changing `current`. Configure the explicit identity choices above.
   Complete the [identity resolver prerequisite](#identity-resolver-prerequisite)
   before preflight. Then validate with the target release helper as the
   service user:

   ```bash
   sudo -iu kravhantering
   # Use the same VERSION directory name as in step 1.
   VERSION=1.2.4
   "/opt/kravhantering/releases/${VERSION}/bin/kravhantering-quadlet.sh" \
     verify-host --topology single-node
   exit
   ```

   Continue only after preflight succeeds. A rejection leaves the installed
   units and running stack intact. Then drain or disable traffic to the host.
   Use the site's load balancer, reverse proxy or firewall procedure so no new
   browser traffic reaches `PUBLIC_HOSTNAME`. Keep administrative access to the
   host available for the remaining steps. Pause the retained cleanup manager
   using the linked cleanup procedure before continuing.

4. Stop the current stack by stopping its Quadlet target:

   ```bash
   sudo -iu kravhantering
   systemctl --user stop kravhantering-single-node.target
   exit
   ```

   Stopping the target preserves the named `kravhantering-sqlserver-data` and
   `kravhantering-keycloak-data` volumes.

5. Prepare the new release bundle under `/opt/kravhantering/releases`
   before the preflight in step 3; skip re-extraction if already complete.
   Extract the verified bundle and label the release-owned nginx files:

   For disconnected upgrades, skip this step. The disconnected
   [Upgrade Import](./rhel10-production-single-node-self-contained-disconnected.md#upgrade-import)
   prepares and labels `/opt/kravhantering/releases/${VERSION}` before this
   guide resumes at step 2 for backup confirmation and step 3 for preflight.

   ```bash
   cd "/tmp/kravhantering-${VERSION}"
   sudo install -d -o root -g root -m 0755 \
     "/opt/kravhantering/releases/${VERSION}"
   sudo tar -xzf "kravhantering-production-deploy-${VERSION}.tar.gz" \
     -C "/opt/kravhantering/releases/${VERSION}" \
     --strip-components=1
   sudo chcon -R -t container_file_t \
     "/opt/kravhantering/releases/${VERSION}/nginx" \
     "/opt/kravhantering/releases/${VERSION}/api-docs"
   ```

   Review the release manifest and lock file before switching `current`:

   ```bash
   less "/opt/kravhantering/releases/${VERSION}/DEPLOYMENT-MANIFEST.json"
   less "/opt/kravhantering/releases/${VERSION}/container-stack.lock.json"
   ```

6. Update `/opt/kravhantering/current` to the new release.
   Move the symlink only after the target release has been extracted and
   labelled:

   ```bash
   sudo ln -sfn "/opt/kravhantering/releases/${VERSION}" \
     /opt/kravhantering/current
   readlink -f /opt/kravhantering/current
   ```

7. Update `/etc/kravhantering/release.env` image refs and verify image IDs.
   Use tag-style `image:tag` values by default. Prefer release-specific
   internal mirror tags for third-party images so moving public tags cannot
   drift after release.

   Choose exactly one image-reference method:

   - For disconnected upgrades, derive refs from the transferred
     `offline-manifest.json`.
   - For an internal registry mirror that preserves repository paths, rewrite
     only the registry host while keeping the locked tags.
   - For an internal mirror with a custom repository layout, set the four
     always-required `*_IMAGE_REF` values manually to site-approved tag refs;
     bundled profiles also require the Keycloak ref.

   For disconnected upgrades, use the manifest that
   [Upgrade Import](./rhel10-production-single-node-self-contained-disconnected.md#upgrade-import)
   verifies and transfers:

   ```bash
   TOPOLOGY=single-node
   OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
   TARGET_IMAGE_REGISTRY="${TARGET_IMAGE_REGISTRY:-}"
   MANIFEST="$OFFLINE_ROOT/offline-manifest.json"
   IDENTITY_PROVIDER_MODE="$(
     sudo sed -n 's/^IDENTITY_PROVIDER_MODE=//p' \
       /etc/kravhantering/release.env
   )"
   : "${IDENTITY_PROVIDER_MODE:?Set IDENTITY_PROVIDER_MODE in release.env}"

   update_ref() {
     sudo sed -i "s#^${1}=.*#${1}=${2}#" /etc/kravhantering/release.env
   }
   source_ref() {
     jq -r --arg name "$1" '.imageRefs[$name]' "$MANIFEST"
   }
   target_ref() {
     local ref path tag
     ref="$(source_ref "$1")"
     if [ -z "$TARGET_IMAGE_REGISTRY" ]; then
       printf '%s\n' "$ref"
       return
     fi
     tag="${ref##*:}"
     path="${ref%:*}"
     printf '%s/%s:%s\n' "$TARGET_IMAGE_REGISTRY" "${path#*/}" "$tag"
   }

   update_ref APP_RUNTIME_IMAGE_REF "$(target_ref app-runtime)"
   update_ref DB_JOB_IMAGE_REF "$(target_ref db-job)"
   update_ref NGINX_IMAGE_REF "$(target_ref nginx)"
   update_ref SQLSERVER_IMAGE_REF "$(target_ref sqlserver)"
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     update_ref KEYCLOAK_IMAGE_REF "$(target_ref keycloak)"
   fi
   ```

   If the site pulls from an internal registry mirror that preserves repository
   paths, rewrite only the registry host while keeping the locked tags:

   ```bash
   TARGET_IMAGE_REGISTRY=registry.example.internal
   IDENTITY_PROVIDER_MODE="$(
     sudo sed -n 's/^IDENTITY_PROVIDER_MODE=//p' \
       /etc/kravhantering/release.env
   )"
   : "${IDENTITY_PROVIDER_MODE:?Set IDENTITY_PROVIDER_MODE in release.env}"
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
   update_ref SQLSERVER_IMAGE_REF \
     "$(mirror_ref sqlserver)"
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     update_ref KEYCLOAK_IMAGE_REF \
       "$(mirror_ref keycloak)"
   fi
   ```

   If the internal mirror uses a custom repository layout, set the four
   always-required `*_IMAGE_REF` values manually to site-approved tag refs and
   add `KEYCLOAK_IMAGE_REF` only for a bundled profile. Then run the
   verification below. Each configured ref must resolve to the locked
   `imageId`.

   Connected upgrades pull and verify the target images as the service user:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   podman pull "$APP_RUNTIME_IMAGE_REF"
   podman pull "$DB_JOB_IMAGE_REF"
   podman pull "$NGINX_IMAGE_REF"
   podman pull "$SQLSERVER_IMAGE_REF"
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     podman pull "$KEYCLOAK_IMAGE_REF"
   fi

   bin/kravhantering-images.sh --topology single-node \
     --lock-file container-stack.lock.json \
     --env-file /etc/kravhantering/release.env \
     verify

   exit
   ```

   Disconnected upgrades already load images during import. Verify without
   pulling from a registry:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   TOPOLOGY=single-node

   bin/kravhantering-images.sh --topology "$TOPOLOGY" \
     --lock-file container-stack.lock.json \
     --env-file /etc/kravhantering/release.env \
     verify

   exit
   ```

8. Run the database jobs once from the new release.
   First ensure SQL Server and its Quadlet network exist for the new release.
   Bundled profiles must also start Keycloak and its identity network. Then run
   the job sequence with the new `DB_JOB_IMAGE_REF`. Use the
   DBA-pre-provisioned production sequence by default, matching
   [rhel10-production-upgrade.md](./rhel10-production-upgrade.md), and skip
   `bootstrap`.

   Set `RUN_BOOTSTRAP=true` only for the self-contained single-node
   bootstrap `db-job.env` that includes `DB_BOOTSTRAP_ADMIN_*` and
   `DB_BOOTSTRAP_APP_*`, and only when the window intentionally provisions
   missing SQL Server principals or role membership. Bootstrap does not rotate
   existing login passwords. For an already provisioned production database,
   leave `RUN_BOOTSTRAP=false`.

   Before installing the new units, provision the SQL Server certificate and
   key described in the deployment guide's
   [TLS Materials](./rhel10-production-single-node-self-contained-deploy.md#tls-materials).
   When the deployment explicitly approves a local self-signed exception, use
   [Appendix B](./rhel10-production-single-node-self-contained-deploy.md#appendix-b-local-self-signed-microsoft-sql-server-tls-set).
   The certificate must chain to `/etc/kravhantering/tls/ca.crt` and match the
   fixed service identity `DNS:sqlserver`. Then remove the legacy insecure trust
   override and configure the database-job CA path:

   ```bash
   sudo sed -i \
     's#^DB_TRUST_SERVER_CERTIFICATE=.*#DB_TRUST_SERVER_CERTIFICATE=false#' \
     /etc/kravhantering/app.env /etc/kravhantering/db-job.env
   if sudo grep -q '^NODE_EXTRA_CA_CERTS=' \
     /etc/kravhantering/db-job.env; then
     SQLSERVER_CA_PATH=/run/kravhantering/sqlserver-ca.crt
     sudo sed -i \
       "s#^NODE_EXTRA_CA_CERTS=.*#NODE_EXTRA_CA_CERTS=${SQLSERVER_CA_PATH}#" \
       /etc/kravhantering/db-job.env
   else
     printf '%s\n' \
       'NODE_EXTRA_CA_CERTS=/run/kravhantering/sqlserver-ca.crt' |
       sudo tee -a /etc/kravhantering/db-job.env >/dev/null
   fi
   openssl verify -verify_hostname sqlserver \
     -CAfile /etc/kravhantering/tls/ca.crt \
     /etc/kravhantering/sqlserver-tls/server.crt
   openssl x509 \
     -in /etc/kravhantering/sqlserver-tls/server.crt \
     -noout -dates -ext extendedKeyUsage,subjectAltName
   ```

   Stop if either certificate check fails. Do not set
   `DB_TRUST_SERVER_CERTIFICATE=true` as a fallback.

   >[!IMPORTANT]
   >Do not run `seed:demo` or the optional demo seed image in production.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a
   bin/kravhantering-quadlet.sh install --topology single-node
   systemctl --user daemon-reload
   systemctl --user start kravhantering-sqlserver.service
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     systemctl --user start kravhantering-keycloak.service
   fi

   exit
   ```

   Start the edge network and discover its resolver. Bundled profiles also
   discover the identity resolver that nginx uses for Keycloak.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   systemctl --user start kravhantering-single-node-edge-network.service
   EDGE_RESOLVER="$(
     bin/kravhantering-quadlet.sh print-resolver \
       --topology single-node --purpose edge
   )"
   printf 'Use NGINX_RESOLVER=%s\n' "$EDGE_RESOLVER"
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     IDENTITY_RESOLVER="$(
       bin/kravhantering-quadlet.sh print-resolver \
         --topology single-node --purpose identity
     )"
     printf 'Use NGINX_IDENTITY_RESOLVER=%s\n' "$IDENTITY_RESOLVER"
   fi

   exit
   ```

   Add or update the edge resolver before starting nginx. For bundled profiles,
   also update the identity resolver. The add path is required when upgrading
   from a release that predates `NGINX_IDENTITY_RESOLVER`:

   ```bash
   # Replace these examples with the printed resolver IPs.
   EDGE_RESOLVER=10.89.0.1
   ID_DNS=10.89.1.1
   set_release_value() {
     local name="$1" value="$2"
     if sudo grep -q "^${name}=" /etc/kravhantering/release.env; then
       sudo sed -i "s#^${name}=.*#${name}=${value}#" \
         /etc/kravhantering/release.env
     else
       printf '%s=%s\n' "$name" "$value" |
         sudo tee -a /etc/kravhantering/release.env >/dev/null
     fi
   }
   set_release_value NGINX_RESOLVER "$EDGE_RESOLVER"
   if ! sudo grep -q '^IDENTITY_PROVIDER_MODE=external$' \
     /etc/kravhantering/release.env; then
     set_release_value NGINX_IDENTITY_RESOLVER "$ID_DNS"
   fi
   ```

   The resolver can change when the internal Quadlet network is recreated or
   assigned another subnet.

   Run the database jobs. Review the target release's Operator Upgrade Notes
   before running `db-job migrate`:

   The migration sequence applies the explicit runtime manifest and verifies
   the custom membership and grants. If a managed runtime user belongs to
   `db_datareader` or `db_datawriter`, reconciliation removes those broad
   memberships only after the custom contract verifies. Other user roles and
   direct grants remain unchanged, but verification rejects effective
   schema-migration or protected-audit mutation access inherited from them.
   Only the db-job identity has migration permission. A successful
   `permission-status` report has `compatible: true` and empty `legacyRoles`
   and `prohibitedEffectivePermissions` arrays for every managed runtime user.

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
   RUN_BOOTSTRAP=false
   DB_CA_SOURCE=/etc/kravhantering/tls/ca.crt
   DB_CA_TARGET=/run/kravhantering/sqlserver-ca.crt
   VERSION="$(basename "$(readlink -f /opt/kravhantering/current)")"
   EVIDENCE_DIR="/var/tmp/kravhantering-upgrade-${VERSION}-evidence"
   mkdir -p "$EVIDENCE_DIR"

   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" wait || exit
   if [ "$RUN_BOOTSTRAP" = "true" ]; then
     podman run --rm --network "$STACK_NETWORK" \
       --env-file /etc/kravhantering/db-job.env \
       --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
       "$DB_JOB_IMAGE_REF" bootstrap || exit
   fi
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-before-${VERSION}.json" || exit
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migrate --json \
     > "$EVIDENCE_DIR/migration-run-${VERSION}.json" || exit
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-after-${VERSION}.json" || exit
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" permission-status \
     > "$EVIDENCE_DIR/runtime-permissions-${VERSION}.json" || exit
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" seed:required || exit

   exit
   ```

   Stop on any failed job. Inspect the saved migration and permission evidence
   before proceeding; later successful commands do not override a failure.

9. Start the stack from the new release. Reinstall the units after correcting
   `NGINX_RESOLVER` and, for bundled profiles, `NGINX_IDENTITY_RESOLVER`. Then
   enable and start the target:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   bin/kravhantering-quadlet.sh install --topology single-node
   systemctl --user daemon-reload
   systemctl --user enable --now kravhantering-single-node.target

   exit
   ```

10. Check `/api/health`, `/api/ready`, the API documentation edge contract,
    sign-in and a read-only UI workflow. Check readiness, then sign in through
    the browser and open an existing read-only requirement view:

    ```bash
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/ready
    ```

    Run the canonical
    [API Documentation Edge Verification](api-docs-edge-verification.md)
    against the final public HTTPS origin. It covers bundled nginx and
    alternative edges, verifies success, redirect and error responses, and
    fails on missing, duplicate or conflicting headers. A failed check blocks
    the upgrade.

    If the host uses the temporary self-signed certificate from
    [Appendix A: Local Self-Signed Public TLS Certificate](./rhel10-production-single-node-self-contained-deploy.md#appendix-a-local-self-signed-public-tls-certificate),
    or the operator workstation does not yet trust the issuing CA, use
    `--insecure` for a manual readiness probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

11. Resume the retained cleanup manager and require a successful one-shot run
    and an active timer, following the linked cleanup procedure. Re-enable
    traffic only after this succeeds. Put the host back into the load balancer,
    reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    `migration-status-before-<version>.json`,
    `migration-run-<version>.json`,
    `migration-status-after-<version>.json`,
    `runtime-permissions-<version>.json` and readiness results to the
    [Operational Evidence](./rhel10-production-single-node-self-contained-deploy.md#operational-evidence)
    record.

    Keep `AI_REQUIREMENT_GENERATION_DISABLED=1` while normal application
    traffic returns. Release the guard only after the
    [AI deployment evidence gate](./ai-connections.md#deployment-evidence-gate)
    passes for this environment and app-runtime has been recreated.

## Rollback

Set `AI_REQUIREMENT_GENERATION_DISABLED=1` before starting rollback. Restore
SQL Server and every referenced external root-key version together when the
database is restored. Use suspension or select a still-usable verified model
revision on the stable profile.
Repeat the AI deployment evidence gate before releasing the guard.

The selected rollback release must already support the shared SQL-backed HSA
verification quota. A release with per-process HSA verification counters is
not eligible for production rollback, regardless of whether its matching
pre-upgrade database state is available. If no eligible rollback release and
database restore point exist, keep access closed and forward-fix the target
release.

Choose the rollback boundary that matches the failed step:

- Before the current Quadlet target is stopped, no runtime migration has
  occurred. Leave the current release active and end the change window.
- After the previous deployment is stopped but before database migration,
  remove the new Quadlet units and start the eligible previous release without a
  database restore.
- After any target-release database migration starts, restore the tested SQL
  Server backup, volume snapshot, or restore point before starting the
  eligible previous release. Do not run individual migration down paths. Restore
  schema, data, permissions, and role memberships as one database state.

For either rollback that follows a failed Quadlet start:

1. Disable traffic, pause the retained cleanup manager, and, as the
   `kravhantering` service user, run
   `systemctl --user disable --now kravhantering-single-node.target`.
2. If migration started, stop SQL Server and restore the recorded pre-upgrade
   database or named-volume snapshot. Use the migration evidence to confirm
   the boundary.
3. Point `/opt/kravhantering/current` back to the eligible previous release
   directory and restore its configuration and
   `/etc/kravhantering/release.env` image refs. For bundled profiles, restore
   compatible Keycloak data and its image, nginx profile and management
   certificates together if the target Keycloak has started, even when no
   application database migration ran.
4. Install the eligible previous release's `single-node` topology, run
   `systemctl --user daemon-reload`, and enable
   `kravhantering-single-node.target`.
5. Verify `/api/health`, `/api/ready` and sign-in. Resume the retained cleanup
   manager and confirm its successful run and active timer before enabling
   traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.

After an eligible rollback, verify the existing SQL and
migration readiness signal, the `hsa_verification_quota_buckets` cleanup
target, and HSA verification capacity events before reopening access.

Never remove the host cleanup units for application rollback or replace their
retained image with the older application's database-job image.
