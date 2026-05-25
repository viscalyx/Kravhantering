# RHEL 10 Single-Node Internal Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the single-node internal
RHEL 10 production topology from released artifacts, with nginx, `app-runtime`,
SQL Server, Keycloak and `db-job` in one rootless Podman Compose network.

For a first install, use
[rhel10-production-single-node-internal-deploy.md](./rhel10-production-single-node-internal-deploy.md).
For the enterprise topology with external SQL Server and external IdP, use
[rhel10-production-upgrade.md](./rhel10-production-upgrade.md).
To uninstall a first install, use
[rhel10-production-single-node-internal-uninstall.md](./rhel10-production-single-node-internal-uninstall.md).

## Planned-Downtime Upgrade

Use planned downtime unless a future release explicitly documents rolling
compatibility. Keep the existing `/etc/kravhantering/*.env` files and realm
JSON during upgrade. The first-install template-copy steps are intentionally
not part of this checklist unless the release notes require a specific
configuration change.

1. Confirm the target release bundle, checksum and locked image identities.
   Download the target bundle and checksum from the approved release source:

   ```bash
   VERSION=1.2.4

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
   jq -r \
     '.services[] | "\(.name) manifest=\(.manifestDigest) imageId=\(.imageId)"' \
     container-stack.lock.json
   ```

   Ensure the site has approved image refs for every single-node image named in
   the target release lock. Internal-registry refs do not need to preserve the
   upstream manifest digest, but they must resolve to the locked `imageId`.

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
   Internal registry refs normally use tags that include the release version or
   a site-controlled promotion tag:

   ```bash
   update_ref() {
     sudo sed -i "s#^${1}=.*#${1}=${2}#" /etc/kravhantering/release.env
   }

   update_ref APP_RUNTIME_IMAGE_REF \
     "registry.example.internal/kravhantering-app-runtime:${VERSION}"
   update_ref DB_JOB_IMAGE_REF \
     "registry.example.internal/kravhantering-db-job:${VERSION}"
   update_ref NGINX_IMAGE_REF \
     "registry.example.internal/nginx:stable-alpine"
   update_ref SQLSERVER_IMAGE_REF \
     "registry.example.internal/mssql/server:2022-latest"
   update_ref KEYCLOAK_IMAGE_REF \
     "registry.example.internal/keycloak/keycloak:26.2"
   ```

   Opt-in: if the site is explicitly approved to pull from public upstream
   registries, use the locked `manifestDigest` values from the release lock:

   ```bash
   LOCK_FILE=/opt/kravhantering/current/container-stack.lock.json
   service_manifest_digest() {
     jq -r --arg name "$1" \
       '.services[] | select(.name == $name) | .manifestDigest' "$LOCK_FILE"
   }

   APP_RUNTIME_MANIFEST_DIGEST="$(service_manifest_digest app-runtime)"
   DB_JOB_MANIFEST_DIGEST="$(service_manifest_digest db-job)"
   NGINX_MANIFEST_DIGEST="$(service_manifest_digest nginx)"
   SQLSERVER_MANIFEST_DIGEST="$(service_manifest_digest sqlserver)"
   KEYCLOAK_MANIFEST_DIGEST="$(service_manifest_digest keycloak)"

   update_ref APP_RUNTIME_IMAGE_REF \
     "ghcr.io/viscalyx/kravhantering-app-runtime@${APP_RUNTIME_MANIFEST_DIGEST}"
   update_ref DB_JOB_IMAGE_REF \
     "ghcr.io/viscalyx/kravhantering-db-job@${DB_JOB_MANIFEST_DIGEST}"
   update_ref NGINX_IMAGE_REF \
     "docker.io/library/nginx@${NGINX_MANIFEST_DIGEST}"
   update_ref SQLSERVER_IMAGE_REF \
     "mcr.microsoft.com/mssql/server@${SQLSERVER_MANIFEST_DIGEST}"
   update_ref KEYCLOAK_IMAGE_REF \
     "quay.io/keycloak/keycloak@${KEYCLOAK_MANIFEST_DIGEST}"
   ```

   Pull and verify the target images as the service user:

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

   Offline path: create the image transport bundle on a connected staging or
   mirror host with the same target `release.env` refs, copy it to the offline
   host, then load it instead of pulling:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   bin/kravhantering-images.sh --topology single-node \
     --lock-file container-stack.lock.json \
     --env-file /etc/kravhantering/release.env \
     export --output "/tmp/kravhantering-images-${VERSION}-single-node.tar.gz"
   exit

   sudo -iu kravhantering
   cd /opt/kravhantering/current
   bin/kravhantering-images.sh --topology single-node \
     --lock-file container-stack.lock.json \
     --env-file /etc/kravhantering/release.env \
     load --bundle "/tmp/kravhantering-images-${VERSION}-single-node.tar.gz"
   exit
   ```

   Offline load requires tag-style `release.env` refs so the loaded image IDs
   can be tagged to the configured targets. On offline-only hosts, those refs
   may use a non-resolvable local or fake registry hostname because
   `podman tag` only creates local image metadata for the later
   `release.env`-driven
   `podman run` and `podman compose` commands. Do not run the pull block above
   on an offline host that uses non-resolvable refs.

8. Run the database jobs once from the new release.
   First ensure SQL Server, Keycloak and the Compose network exist for the new
   release, then run the job sequence with the new `DB_JOB_IMAGE_REF`. Use the
   DBA-pre-provisioned production sequence by default, matching
   [rhel10-production-upgrade.md](./rhel10-production-upgrade.md), and skip
   `bootstrap`.

   Set `RUN_BOOTSTRAP=true` only for the controlled internal/single-node
   bootstrap `db-job.env` that still includes `DB_BOOTSTRAP_ADMIN_*` and
   `DB_BOOTSTRAP_APP_*`, and only when the window intentionally performs SQL
   Server password provisioning or rotation. For DBA-pre-provisioned production
   environments where the `DB_BOOTSTRAP_*` values have been removed, leave
   `RUN_BOOTSTRAP=false` to avoid unintended `ALTER LOGIN` password rotations.
   Do not run `seed:demo` in production.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   STACK_NETWORK=kravhantering-single-node_kravhantering-internal
   RUN_BOOTSTRAP=false

   podman compose --env-file /etc/kravhantering/release.env \
     -f compose/single-node.compose.yml up -d sqlserver keycloak

   podman run --rm --network "$STACK_NETWORK" --entrypoint /bin/sh \
     "$NGINX_IMAGE_REF" -c "awk '/^nameserver / { print \$2; exit }' /etc/resolv.conf"

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
     "$DB_JOB_IMAGE_REF" migrate
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
   preserves unrelated users:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   STACK_NETWORK=kravhantering-single-node_kravhantering-internal
   DEMO_USERS_FILE=$PWD/keycloak/demo-users.not-for-production.json
   DEMO_USERS_TARGET=/workspace/keycloak/demo-users.not-for-production.json
   SCRIPT_FILE=$PWD/scripts/keycloak-demo-users.mjs
   SCRIPT_TARGET=/workspace/scripts/keycloak-demo-users.mjs

   podman run --rm --pull=never --network "$STACK_NETWORK" \
     --entrypoint node --user 0:0 \
     --env-file /etc/kravhantering/keycloak.env \
     --volume "$SCRIPT_FILE:$SCRIPT_TARGET:ro" \
     --volume "$DEMO_USERS_FILE:$DEMO_USERS_TARGET:ro" \
     "$DB_JOB_IMAGE_REF" \
     "$SCRIPT_TARGET" demo-users:sync \
     --users "$DEMO_USERS_TARGET" \
     --base-url http://keycloak:8080 \
     --realm kravhantering-production

   exit
   ```

   For disposable test and development databases that should match the new
   release's current fixtures, rerun the destructive demo seed after
   `seed:required`:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   STACK_NETWORK=kravhantering-single-node_kravhantering-internal
   DEMO=$PWD/demo-seed
   TYPEORM=/workspace/typeorm
   DOG=seed-dogfood.mjs
   DOG_BUILD=seed-dogfood-build.mjs
   RET_BUILD=seed-archiving-retention-build.mjs

   podman run --rm --network "$STACK_NETWORK" \
     --env-file /etc/kravhantering/db-job.env \
     --volume "$DEMO/seed.mjs:$TYPEORM/seed.mjs:ro" \
     --volume "$DEMO/$DOG:$TYPEORM/$DOG:ro" \
     --volume "$DEMO/$DOG_BUILD:$TYPEORM/$DOG_BUILD:ro" \
     --volume "$DEMO/$RET_BUILD:$TYPEORM/$RET_BUILD:ro" \
     "$DB_JOB_IMAGE_REF" seed:demo

   exit
   ```

   If the printed resolver differs from `NGINX_RESOLVER`, update
   `/etc/kravhantering/release.env` before starting nginx.

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

10. Check `/api/health`, `/api/ready`, sign-in and a read-only UI workflow.
    Check readiness through nginx, then sign in through the browser and open an
    existing read-only requirement view:

    ```bash
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/ready
    ```

    If the host uses the temporary self-signed certificate from
    [Appendix A: Local Self-Signed TLS Certificate](./rhel10-production-single-node-internal-deploy.md#appendix-a-local-self-signed-tls-certificate),
    or the operator workstation does not yet trust the issuing CA, use
    `--insecure` for a manual readiness probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

11. Re-enable traffic.
    Put the host back into the load balancer, reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    readiness results to the
    [Operational Evidence](./rhel10-production-single-node-internal-deploy.md#operational-evidence)
    record.

## Rollback

Rollback after a migration requires restoring the SQL Server backup, volume
snapshot or restore point taken before the upgrade. The supported sequence is:

1. Disable traffic.
2. Stop `nginx` and `app-runtime`.
3. Restore SQL Server to the pre-upgrade restore point.
4. Point `/opt/kravhantering/current` back to the previous release directory.
5. Restore the previous `/etc/kravhantering/release.env` image refs.
6. Start the stack with `podman compose up -d` from the previous release.
7. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.
