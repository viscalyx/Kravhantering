# RHEL 10 Self-Contained Single-Node Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the self-contained
single-node RHEL 10 production topology from released artifacts, with nginx,
`app-runtime`, SQL Server and Keycloak as rootless Podman Quadlet services.
`db-job` remains an explicit release operation on the same network.

Before the change, read `IDENTITY_PROVIDER_MODE` from
`/etc/kravhantering/release.env` and record it in the change ticket:

- `bundled` is the test-oriented default; do not relabel it as production
  hardened during an upgrade.
- `external` has no bundled Keycloak unit, image, identity network or volume.
  Skip Keycloak image, realm-sync, backup and recovery steps and coordinate
  provider changes with its deployer.
- `hardened-bundled` must preserve the management bind, mTLS certificates,
  `KC_HOSTNAME_ADMIN`, user-facing deny rules, named MFA administrators and
  retired bootstrap identity. Follow the
  [production-hardening appendix](./rhel10-production-single-node-self-contained-deploy.md#appendix-c-production-hardened-bundled-keycloak)
  before and after upgrade or rollback.

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

The production `db-job` image carries the plain-Node provider-secret
maintenance module. Use its bounded `provider-secret-root-rotate` command for
root-key rotation and `provider-secret-restore-verify` for restore and old-key
removal proof; never run the TypeScript application service as an operations
script.

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
   when a site explicitly requires pull-time digest pinning. The optional
   `kravhantering-demo-seed` image can be listed separately in the GitHub
   Release notes, but it is not part of `container-stack.lock.json`,
   `release.env` or the production upgrade path.

2. Confirm a tested SQL Server backup, volume snapshot or restore point.
   Complete the site-approved restore procedure before the window begins and
   record the backup, snapshot or restore-point identifier. Do not continue
   unless the restore point covers the database state before any target-release
   migration runs.

3. Drain or disable traffic to the host.
   Use the site's load balancer, reverse proxy or firewall procedure so no new
   browser traffic reaches `PUBLIC_HOSTNAME`. Keep administrative access to the
   host available for the remaining steps.

4. Stop the current stack by stopping its Quadlet target:

   ```bash
   sudo -iu kravhantering
   systemctl --user stop kravhantering-single-node.target
   exit
   ```

   Stopping the target preserves the named `kravhantering-sqlserver-data` and
   `kravhantering-keycloak-data` volumes.

5. Install the new release bundle under `/opt/kravhantering/releases`.
   Extract the verified bundle and label the release-owned nginx files:

   For disconnected upgrades, skip this step. The disconnected
   [Upgrade Import](./rhel10-production-single-node-self-contained-disconnected.md#upgrade-import)
   prepares and labels `/opt/kravhantering/releases/${VERSION}` before this
   guide resumes at step 6.

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
   - For connected staging only, derive public upstream refs from the target
     release lock.
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
   # Test/demo only: set TOPOLOGY=single-node-demo.
   OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
   TARGET_IMAGE_REGISTRY="${TARGET_IMAGE_REGISTRY:-}"
   MANIFEST="$OFFLINE_ROOT/offline-manifest.json"
   IDENTITY_PROVIDER_MODE="$(
     sudo sed -n 's/^IDENTITY_PROVIDER_MODE=//p' \
       /etc/kravhantering/release.env
   )"
   IDENTITY_PROVIDER_MODE="${IDENTITY_PROVIDER_MODE:-bundled}"

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
   if [ "$TOPOLOGY" = "single-node-demo" ]; then
     update_ref KONG_IMAGE_REF "$(target_ref kong)"
     update_ref HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF \
       "$(target_ref hsa-person-lookup-adapter)"
     update_ref HSA_MTLS_PROVISIONER_IMAGE_REF \
       "$(target_ref hsa-mtls-provisioner)"
     update_ref HSA_DIRECTORY_MOCK_IMAGE_REF \
       "$(target_ref hsa-directory-mock)"
   fi
   ```

   For connected staging only, derive the public upstream refs from the target
   release lock and verify them immediately:

   ```bash
   IDENTITY_PROVIDER_MODE="$(
     sudo sed -n 's/^IDENTITY_PROVIDER_MODE=//p' \
       /etc/kravhantering/release.env
   )"
   IDENTITY_PROVIDER_MODE="${IDENTITY_PROVIDER_MODE:-bundled}"
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
   update_ref SQLSERVER_IMAGE_REF \
     "$(service_ref sqlserver)"
   if [ "$IDENTITY_PROVIDER_MODE" != "external" ]; then
     update_ref KEYCLOAK_IMAGE_REF \
       "$(service_ref keycloak)"
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
   IDENTITY_PROVIDER_MODE="${IDENTITY_PROVIDER_MODE:-bundled}"
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
   # Test/demo only: set TOPOLOGY=single-node-demo.

   SUPPORT_LOCK_ARGS=()
   if [ "$TOPOLOGY" = "single-node-demo" ]; then
     SUPPORT_LOCK_ARGS=(
       --hsa-integration-lock-file container-hsa-integration-support.lock.json
       --test-lock-file container-test-support.lock.json
     )
   fi

   bin/kravhantering-images.sh --topology "$TOPOLOGY" \
     --lock-file container-stack.lock.json \
     "${SUPPORT_LOCK_ARGS[@]}" \
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
   bootstrap `db-job.env` that still includes `DB_BOOTSTRAP_ADMIN_*` and
   `DB_BOOTSTRAP_APP_*`, and only when the window intentionally performs SQL
   Server password provisioning or rotation. For DBA-pre-provisioned production
   environments where the `DB_BOOTSTRAP_*` values have been removed, leave
   `RUN_BOOTSTRAP=false` to avoid unintended `ALTER LOGIN` password rotations.

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

   Releases that predate the identity resolver setting need a temporary value
   so the helper can render the network units. nginx is not started with this
   value; the resolver discovery below replaces it before the full target
   starts:

   ```bash
   if ! sudo grep -q '^IDENTITY_PROVIDER_MODE=external$' \
     /etc/kravhantering/release.env && \
     ! sudo grep -q '^NGINX_IDENTITY_RESOLVER=' \
       /etc/kravhantering/release.env; then
     printf '%s\n' 'NGINX_IDENTITY_RESOLVER=10.89.1.1' |
       sudo tee -a /etc/kravhantering/release.env >/dev/null
   fi
   ```

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
   EVIDENCE_DIR="/var/tmp/kravhantering-upgrade-${VERSION}-evidence"
   mkdir -p "$EVIDENCE_DIR"

   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" wait
   if [ "$RUN_BOOTSTRAP" = "true" ]; then
     podman run --rm --network "$STACK_NETWORK" \
       --env-file /etc/kravhantering/db-job.env \
       --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
       "$DB_JOB_IMAGE_REF" bootstrap
   fi
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-before-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migrate --json \
     > "$EVIDENCE_DIR/migration-run-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-after-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" permission-status \
     > "$EVIDENCE_DIR/runtime-permissions-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "${DB_CA_SOURCE}:${DB_CA_TARGET}:ro" \
     "$DB_JOB_IMAGE_REF" seed:required

   exit
   ```

   For disposable test and development deployments that use bundled demo users,
   rerun the running Keycloak realm sync as the `kravhantering` host user while
   `keycloak` is running. The container reads the Keycloak admin credentials
   from `/etc/kravhantering/keycloak.env`. The sync adds, updates and removes
   generated demo users, adopts same-username users into the demo set and
   preserves unrelated users.

   Before running the sync against a realm whose user profile does not already
   declare it, add an administrator-only `kravhanteringDemoUser` user-profile
   attribute to the running Keycloak realm. In the Keycloak admin console, open
   **Realm settings**, **User profile**, and add this managed attribute. Do not
   enable arbitrary unmanaged attributes:

   ```json
   {
     "name": "kravhanteringDemoUser",
     "displayName": "Kravhantering demo user marker",
     "group": "user-metadata",
     "validations": {
       "length": { "max": 4 },
       "pattern": {
         "pattern": "^true$",
         "error-message": "Invalid demo user marker"
       }
     },
     "permissions": {
       "view": ["admin"],
       "edit": ["admin"]
     },
     "multivalued": false
   }
   ```

   The `*_CONTAINER_FILE` paths below exist inside the temporary container, not
   on the host:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   if [ "$IDENTITY_PROVIDER_MODE" = "external" ]; then
     printf '%s\n' \
       'Skip bundled Keycloak demo-user synchronization for external OIDC.'
     exit
   fi

   STACK_NETWORK="$(
     bin/kravhantering-quadlet.sh print-network \
       --topology single-node --purpose identity
   )"
   DEMO_USERS_FILE=$PWD/keycloak/demo-users.not-for-production.json
   DEMO_USERS_CONTAINER_FILE=/tmp/demo-users.not-for-production.json
   SCRIPT_FILE=$PWD/scripts/keycloak-demo-users.mjs
   SCRIPT_CONTAINER_FILE=/tmp/keycloak-demo-users.mjs

   podman run --rm --pull=never --network "$STACK_NETWORK" \
     --entrypoint node --user 0:0 \
     --env-file /etc/kravhantering/keycloak.env \
     --volume "$SCRIPT_FILE:$SCRIPT_CONTAINER_FILE:ro" \
     --volume "$DEMO_USERS_FILE:$DEMO_USERS_CONTAINER_FILE:ro" \
     "$DB_JOB_IMAGE_REF" \
     "$SCRIPT_CONTAINER_FILE" demo-users:sync \
     --users "$DEMO_USERS_CONTAINER_FILE" \
     --base-url http://keycloak:8080 \
     --realm kravhantering-production

   exit
   ```

   For disposable test and development databases that should match the new
   release's current fixtures, rerun the destructive demo seed after
   `seed:required` with the optional `kravhantering-demo-seed` image listed
   under Demonstration Container Images in the GitHub Release notes. This image
   is not configured in `/etc/kravhantering/release.env`.

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
     "$DEMO_SEED_IMAGE_REF"

   exit
   ```

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

    The Quadlet networks retain the established edge, database, and egress
    names documented in the deployment guide. Bundled profiles also retain the
    identity network. The SQL Server volume retains its established name, and
    bundled profiles retain the Keycloak volume name.

11. Re-enable traffic.
    Put the host back into the load balancer, reverse proxy or firewall
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
revision on the stable profile; the direct OpenRouter path does not exist.
Repeat the AI deployment evidence gate before releasing the guard.

Choose the rollback boundary that matches the failed step:

- Before the current Quadlet target is stopped, no runtime migration has
  occurred. Leave the current release active and end the change window.
- After the previous deployment is stopped but before database migration,
  remove the new Quadlet units and start the previous release without a
  database restore.
- After any target-release database migration starts, restore the tested SQL
  Server backup, volume snapshot, or restore point before starting the
  previous release. Do not run individual migration down paths. Restore
  schema, data, permissions, and role memberships as one database state.

For either rollback that follows a failed Quadlet start:

1. Disable traffic and run
   `systemctl --user disable --now kravhantering-single-node.target`.
2. If migration started, stop SQL Server and restore the recorded pre-upgrade
   database or named-volume snapshot. Use the migration evidence to confirm
   the boundary.
3. Point `/opt/kravhantering/current` back to the previous release directory
   and restore its `/etc/kravhantering/release.env` image refs.
4. Install the previous release's `single-node` topology, run
   `systemctl --user daemon-reload`, and enable
   `kravhantering-single-node.target`.
5. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.

The release also adds the scheduled transient-state cleanup units. Before
restoring traffic, complete the activation and first-run verification in
[Scheduled Transient-State Cleanup](transient-state-cleanup.md). Its rollback
section removes the new timer before an older release is started.
