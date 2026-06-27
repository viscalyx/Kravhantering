# RHEL 10 Production Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the enterprise RHEL 10
production topology from released artifacts, with external SQL Server and an
external IdP.

For a first install, use
[rhel10-production-deploy.md](./rhel10-production-deploy.md). For the
self-contained single-node topology, use
[rhel10-production-single-node-self-contained-upgrade.md](./rhel10-production-single-node-self-contained-upgrade.md).
To uninstall a first install, use
[rhel10-production-uninstall.md](./rhel10-production-uninstall.md).

>[!NOTE]
>For disconnected upgrades, first follow
>[rhel10-production-disconnected.md](./rhel10-production-disconnected.md). The
>disconnected guide prepares the transferable bundle before the downtime window
>and tells you which connected artifact and image steps it replaces on each
>disconnected app node.

## Planned-Downtime Upgrade

Use planned downtime unless a future release explicitly documents rolling
compatibility. Keep the existing `/etc/kravhantering/*.env` files during
upgrade. The first-install template-copy steps are intentionally not part of
this checklist unless the release notes require a specific configuration
change.

Run app-node steps on every RHEL app node. Run the database job sequence once
for the release, after the target release bundle and image references are in
place.

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

   Ensure the site has approved tag-style image refs for every app-node image
   named in the target release lock. Each configured ref must resolve to the
   locked `imageId`. The helper also accepts `image:tag@sha256:digest` refs
   when a site explicitly requires pull-time digest pinning.

2. Confirm a tested SQL Server backup or restore point.
   Complete the DBA-approved restore procedure before the window begins and
   record the backup or restore-point identifier. Do not continue unless the
   restore point covers the database state before any target-release migration
   runs.

3. Drain or disable traffic to all app nodes.
   Use the site's load balancer, reverse proxy or firewall procedure so no new
   browser traffic reaches the app nodes. Keep administrative access to the
   hosts available for the remaining steps.

4. Stop `nginx` and `app-runtime` on every app node.
   Run this as the rootless service user from the current release directory.
   Use the TLS Compose file unless this node is behind a TLS-terminating load
   balancer:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   COMPOSE_FILE=compose/app-node-tls.compose.yml
   # COMPOSE_FILE=compose/app-node-http.compose.yml

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" stop nginx app-runtime
   exit
   ```

5. Install the new release bundle under `/opt/kravhantering/releases` on every
   app node.
   Extract the verified bundle and label the release-owned nginx files:

   For disconnected upgrades, skip this step. The disconnected
   [Upgrade Import](./rhel10-production-disconnected.md#upgrade-import)
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

6. Update `/opt/kravhantering/current` to the new release on every app node.
   Move the symlink only after the target release has been extracted and
   labelled:

   ```bash
   sudo ln -sfn "/opt/kravhantering/releases/${VERSION}" \
     /opt/kravhantering/current
   readlink -f /opt/kravhantering/current
   ```

7. Update `/etc/kravhantering/release.env` image refs and verify image IDs on
   every app node.
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
   - For an internal mirror with a custom repository layout, set the three
     `*_IMAGE_REF` values manually to site-approved tag refs.

   For disconnected upgrades, use the manifest that
   [Upgrade Import](./rhel10-production-disconnected.md#upgrade-import)
   verifies and transfers:

   ```bash
   TOPOLOGY=app-node
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

   bin/kravhantering-images.sh --topology app-node \
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

   bin/kravhantering-images.sh --topology app-node \
     --lock-file container-stack.lock.json \
     --env-file /etc/kravhantering/release.env \
     verify

   exit
   ```

8. Run the database jobs once from the new release.
   Use the DBA-pre-provisioned `db-job.env` values. Do not run
   `db-job bootstrap` during a normal upgrade, and do not run `seed:demo` or
   the optional `kravhantering-demo-seed` image in production. Review the target
   release's Operator Upgrade Notes before running `db-job migrate`.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a
   EVIDENCE_DIR="/var/tmp/kravhantering-upgrade-${VERSION}-evidence"
   mkdir -p "$EVIDENCE_DIR"

   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" wait
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-before-${VERSION}.json"
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migrate --json \
     > "$EVIDENCE_DIR/migration-run-${VERSION}.json"
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migration-status \
     > "$EVIDENCE_DIR/migration-status-after-${VERSION}.json"
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" seed:required

   exit
   ```

9. Start each app node from the new release.
   Start `app-runtime` first:

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
   `podman compose` attaches long-running services to the network
   automatically.

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

   The resolver can change when the internal Compose network is renamed,
   recreated or assigned another subnet.

   Start the full app node:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   COMPOSE_FILE=compose/app-node-tls.compose.yml
   # COMPOSE_FILE=compose/app-node-http.compose.yml

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" up -d

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

    If the host uses a self-signed certificate, or the operator workstation
    does not yet trust the issuing CA, use `--insecure` for a manual readiness
    probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

    After the upgraded app node passes health checks, remove the obsolete
    pre-rename network if it is still present and no containers use it:

    ```bash
    sudo -iu kravhantering
    OBSOLETE_NETWORK=kravhantering-app-node_kravhantering-internal
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
    Put the app nodes back into the load balancer, reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    `migration-status-before-<version>.json`,
    `migration-run-<version>.json`,
    `migration-status-after-<version>.json` and readiness results to the
    [Operational Evidence](./rhel10-production-deploy.md#operational-evidence)
    record.

## Rollback

Rollback after a migration requires restoring the database backup or restore
point taken before the upgrade. Use the captured migration evidence to confirm
which database head was observed before and after the failed upgrade. The
supported sequence is:

1. Disable traffic to all app nodes.

2. Stop `nginx` and `app-runtime` on every app node.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   COMPOSE_FILE=compose/app-node-tls.compose.yml
   # COMPOSE_FILE=compose/app-node-http.compose.yml

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" stop nginx app-runtime
   exit
   ```

3. Restore SQL Server to the pre-upgrade restore point.

4. Point `/opt/kravhantering/current` back to the previous release directory
   on every app node.

   ```bash
   PREVIOUS_VERSION=1.2.3 # Change to the previous version being restored.

   sudo ln -sfn "/opt/kravhantering/releases/${PREVIOUS_VERSION}" \
     /opt/kravhantering/current
   readlink -f /opt/kravhantering/current
   ```

5. Restore the previous `/etc/kravhantering/release.env` image refs on every
   app node.
   Use the release evidence record or rerun the image-reference update with
   the previous release's `container-stack.lock.json`.

6. Start the previous app nodes.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   COMPOSE_FILE=compose/app-node-tls.compose.yml
   # COMPOSE_FILE=compose/app-node-http.compose.yml

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" up -d
   exit
   ```

7. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.

## Credential Rotation

Use this procedure for day-2 rotation of production auth credentials when no
release upgrade is being installed. It does not require a database migration or
database restore point. It does require recreating `app-runtime` because auth
environment variables are read at process start.

Plan a maintenance window for any rotation that changes
`AUTH_SESSION_COOKIE_PASSWORD`, or when the IdP cannot keep both old and new
client secrets active during the cutover. Rotating
`AUTH_SESSION_COOKIE_PASSWORD` invalidates every live browser session. Users
must sign in again after the app runtime restarts.

1. Record the rotation scope and current operational evidence.
   Include which values are rotating:
   `AUTH_OIDC_CLIENT_SECRET`, optional MCP service-client secrets,
   `AUTH_SESSION_COOKIE_PASSWORD`, or a combination of them. Do not copy raw
   secrets into the long-term evidence record.

2. Create a restricted temporary backup of the current app environment on each
   app node.
   Keep this only for rollback during the rotation window unless the site's
   records policy explicitly requires longer retention:

   ```bash
   ROTATION_ID="$(date -u +%Y%m%dT%H%M%SZ)"
   ROTATION_DIR="/var/tmp/kravhantering-credential-rotation-${ROTATION_ID}"

   sudo install -d -o root -g root -m 0700 "$ROTATION_DIR"
   sudo install -o root -g root -m 0600 \
     /etc/kravhantering/app.env \
     "$ROTATION_DIR/app.env.before"
   ```

3. Prepare the new external credentials.

   - For `AUTH_OIDC_CLIENT_SECRET`, ask the IdP administrator to add or issue a
     new secret for the existing `kravhantering-app` client.
   - If the IdP supports overlapping secrets, keep the old secret active until
     every app node has been updated and verified.
   - If the IdP supports only one active secret, drain traffic before changing
     either the IdP client secret or `/etc/kravhantering/app.env`.
   - Optional MCP service-client secrets are not consumed by `app-runtime` for
     token validation. Rotate them in the IdP and in the approved MCP client
     secret store. The identity-platform or IdP administration owner issues,
     rotates and revokes the `kravhantering-mcp` credentials. The consuming
     MCP integration owner deploys the new secret to the MCP client. If the
     MCP client id or access-token audience changes, Kravhantering operations
     updates the corresponding site configuration such as `MCP_CLIENT_ID` and
     `AUTH_OIDC_API_AUDIENCE`.
   - Generate a new `AUTH_SESSION_COOKIE_PASSWORD` only when session-cookie
     key rotation is in scope.

4. Update `/etc/kravhantering/app.env` on every app node.
   Use the site's approved secret editor or secret-management deployment path.
   Avoid commands that place secrets in shell history. Keep file ownership and
   mode restricted to the deployment convention from the first-install guide.

5. Recreate `app-runtime` on every app node.
   Recreate nginx as well so older bundles do not keep a stale upstream
   address after the app container changes:

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

6. Verify readiness and sign-in before restoring traffic.

   ```bash
   curl --fail --silent --show-error \
     https://kravhantering.example.internal/api/health
   curl --fail --silent --show-error \
     https://kravhantering.example.internal/api/ready
   ```

   Then complete a browser login and logout against the public URL. If MCP
   service-client credentials changed, obtain a new service token and call a
   read-only `/api/mcp/*` path with `Authorization: Bearer <jwt>`.

7. Complete or roll back the rotation.

   - After successful verification, revoke the old OIDC or MCP client secrets
     in the IdP and delete the temporary raw `app.env` backup unless retention
     is required.
   - If verification fails before the old IdP secret has been revoked, restore
     the backed-up `app.env`, recreate `app-runtime` and nginx again, and ask
     the IdP administrator to revoke the new failed secret.
   - If the old IdP secret has already been revoked and cannot be restored,
     issue another replacement secret and repeat the cutover instead of
     restoring a now-invalid `app.env`.
   - Rolling back `AUTH_SESSION_COOKIE_PASSWORD` invalidates sessions created
     after the failed rotation. Plan for another sign-in wave.

Add the rotation date, affected credential names, IdP change reference,
verification result and old-secret revocation confirmation to the operational
evidence record. Do not store raw secret values in that record.
