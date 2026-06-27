# RHEL 10 Self-Contained Single-Node Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the self-contained
single-node RHEL 10 production topology from released artifacts, with nginx,
`app-runtime`, SQL Server, Keycloak and `db-job` in one rootless Podman Compose
network.

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
   curl -fLO "${RELEASE_DOWNLOAD_URL}/container-stack.lock.json"
   sha256sum -c "kravhantering-production-deploy-${VERSION}.tar.gz.sha256"
   jq -r '
     .services[]
     | "\(.name) manifest=\(.manifestDigest) imageId=\(.imageId)"
   ' container-stack.lock.json
   ```

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

4. Stop `nginx` and `app-runtime`; leave SQL Server and Keycloak running.
   Run this as the rootless service user from the current release directory:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   podman compose --env-file /etc/kravhantering/release.env \
     -f compose/single-node.compose.yml stop nginx app-runtime
   exit
   ```

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
     "/opt/kravhantering/releases/${VERSION}/nginx"
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
   - For an internal mirror with a custom repository layout, set the five
     `*_IMAGE_REF` values manually to site-approved tag refs.

   For disconnected upgrades, use the manifest that
   [Upgrade Import](./rhel10-production-single-node-self-contained-disconnected.md#upgrade-import)
   verifies and transfers:

   ```bash
   TOPOLOGY=single-node
   # Test/demo only: set TOPOLOGY=single-node-demo.
   OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
   TARGET_IMAGE_REGISTRY="${TARGET_IMAGE_REGISTRY:-}"
   MANIFEST="$OFFLINE_ROOT/offline-manifest.json"

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
   update_ref KEYCLOAK_IMAGE_REF "$(target_ref keycloak)"
   if [ "$TOPOLOGY" = "single-node-demo" ]; then
     update_ref KONG_IMAGE_REF "$(target_ref kong)"
     update_ref HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF \
       "$(target_ref hsa-person-lookup-adapter)"
     update_ref HSA_DIRECTORY_MOCK_IMAGE_REF \
       "$(target_ref hsa-directory-mock)"
   fi
   ```

   For connected staging only, derive the public upstream refs from the target
   release lock and verify them immediately:

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
   update_ref SQLSERVER_IMAGE_REF \
     "$(service_ref sqlserver)"
   update_ref KEYCLOAK_IMAGE_REF \
     "$(service_ref keycloak)"
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
   update_ref SQLSERVER_IMAGE_REF \
     "$(mirror_ref sqlserver)"
   update_ref KEYCLOAK_IMAGE_REF \
     "$(mirror_ref keycloak)"
   ```

   If the internal mirror uses a custom repository layout, set the five
   `*_IMAGE_REF` values manually to site-approved tag refs, then run the
   verification below. Each ref must resolve to the locked `imageId`.

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
   podman pull "$KEYCLOAK_IMAGE_REF"

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
   First ensure SQL Server, Keycloak and the Compose network exist for the new
   release, then run the job sequence with the new `DB_JOB_IMAGE_REF`. Use the
   DBA-pre-provisioned production sequence by default, matching
   [rhel10-production-upgrade.md](./rhel10-production-upgrade.md), and skip
   `bootstrap`.

   Set `RUN_BOOTSTRAP=true` only for the self-contained single-node
   bootstrap `db-job.env` that still includes `DB_BOOTSTRAP_ADMIN_*` and
   `DB_BOOTSTRAP_APP_*`, and only when the window intentionally performs SQL
   Server password provisioning or rotation. For DBA-pre-provisioned production
   environments where the `DB_BOOTSTRAP_*` values have been removed, leave
   `RUN_BOOTSTRAP=false` to avoid unintended `ALTER LOGIN` password rotations.

   >[!IMPORTANT]
   >Do not run `seed:demo` or the optional demo seed image in production.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a
   STACK_NETWORK=kravhantering-internal

   podman network exists "$STACK_NETWORK" || \
     podman network create "$STACK_NETWORK"

   podman compose --env-file /etc/kravhantering/release.env \
     -f compose/single-node.compose.yml up -d sqlserver keycloak

   exit
   ```

   Confirm the nginx resolver from inside the same Compose network. The
   `STACK_NETWORK` variable is for temporary `podman run` containers that need
   internal service-name DNS such as `keycloak` or `sqlserver`. `podman
   compose` attaches the long-running services to the network automatically.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   STACK_NETWORK=kravhantering-internal

   RESOLVER_IP="$(
     podman run --rm --network "$STACK_NETWORK" --entrypoint /bin/sh \
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

   The resolver can change when the internal Compose network is renamed,
   recreated or assigned another subnet.

   Run the database jobs. Review the target release's Operator Upgrade Notes
   before running `db-job migrate`:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   STACK_NETWORK=kravhantering-internal
   RUN_BOOTSTRAP=false
   EVIDENCE_DIR="/var/tmp/kravhantering-upgrade-${VERSION}-evidence"
   mkdir -p "$EVIDENCE_DIR"

   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" wait
   if [ "$RUN_BOOTSTRAP" = "true" ]; then
     podman run --rm --network "$STACK_NETWORK" \
       --env-file /etc/kravhantering/db-job.env \
       "$DB_JOB_IMAGE_REF" bootstrap
   fi
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-before-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migrate --json \
     > "$EVIDENCE_DIR/migration-run-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-after-${VERSION}.json"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
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

   STACK_NETWORK=kravhantering-internal
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

   STACK_NETWORK=kravhantering-internal
   DEMO_SEED_IMAGE_REF=ghcr.io/viscalyx/kravhantering-demo-seed:replace-with-release-tag

   podman pull "$DEMO_SEED_IMAGE_REF"
   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     "$DEMO_SEED_IMAGE_REF"

   exit
   ```

9. Start the stack from the new release.
   Start all long-running services with the same Compose command used after a
   first install:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   podman compose --env-file /etc/kravhantering/release.env \
     -f compose/single-node.compose.yml up -d

   exit
   ```

10. Check `/api/health`, `/api/ready`, `/api-docs/hsa-person-lookup/`,
    sign-in and a read-only UI workflow. Check readiness and the static
    HSA-person lookup Swagger UI through nginx, then sign in through the
    browser and open an existing read-only requirement view:

    ```bash
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/ready
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api-docs/hsa-person-lookup/
    ```

    If the host uses the temporary self-signed certificate from
    [Appendix A: Local Self-Signed TLS Certificate](./rhel10-production-single-node-self-contained-deploy.md#appendix-a-local-self-signed-tls-certificate),
    or the operator workstation does not yet trust the issuing CA, use
    `--insecure` for a manual readiness probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

    After the upgraded stack passes health checks, remove the obsolete
    pre-rename network if it is still present and no containers use it:

    ```bash
    sudo -iu kravhantering
    OBSOLETE_NETWORK=kravhantering-single-node_kravhantering-internal
    if podman network exists "$OBSOLETE_NETWORK"; then
      ATTACHED_CONTAINERS="$(
        podman network inspect "$OBSOLETE_NETWORK" \
          --format '{{len .Containers}}'
      )"
      if [ "${ATTACHED_CONTAINERS:-0}" -eq 0 ]; then
        podman network rm "$OBSOLETE_NETWORK"
      else
        printf 'Skipping obsolete network %s; %s containers still use it.\n' \
          "$OBSOLETE_NETWORK" "$ATTACHED_CONTAINERS"
      fi
    fi
    exit
    ```

11. Re-enable traffic.
    Put the host back into the load balancer, reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    `migration-status-before-<version>.json`,
    `migration-run-<version>.json`,
    `migration-status-after-<version>.json` and readiness results to the
    [Operational Evidence](./rhel10-production-single-node-self-contained-deploy.md#operational-evidence)
    record.

## Rollback

Rollback after a migration requires restoring the SQL Server backup, volume
snapshot or restore point taken before the upgrade. Use the captured migration
evidence to confirm which database head was observed before and after the
failed upgrade. The supported sequence is:

1. Disable traffic.
2. Stop `nginx` and `app-runtime`.
3. Restore SQL Server to the pre-upgrade restore point.
4. Point `/opt/kravhantering/current` back to the previous release directory.
5. Restore the previous `/etc/kravhantering/release.env` image refs.
6. Start the stack with `podman compose up -d` from the previous release.
7. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.
