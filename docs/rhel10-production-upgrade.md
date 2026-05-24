# RHEL 10 Production Planned-Downtime Upgrade

<!-- cSpell:words readlink resolv -->

This guide describes how to upgrade and roll back the enterprise RHEL 10
production topology from released artifacts, with external SQL Server and an
external IdP.

For a first install, use
[rhel10-production-deploy.md](./rhel10-production-deploy.md). For the
all-in-one internal topology, use
[rhel10-production-single-node-internal-upgrade.md](./rhel10-production-single-node-internal-upgrade.md).
To uninstall a first install, use
[rhel10-production-uninstall.md](./rhel10-production-uninstall.md).

## Planned-Downtime Upgrade

Use planned downtime unless a future release explicitly documents rolling
compatibility. Keep the existing `/etc/kravhantering/*.env` files during
upgrade. The first-install template-copy steps are intentionally not part of
this checklist unless the release notes require a specific configuration
change.

Run app-node steps on every RHEL app node. Run the database job sequence once
for the release, after the target release bundle and image references are in
place.

1. Confirm the target release bundle, checksum and mirrored image digests.
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
   jq -r '.services[] | "\(.name) \(.digest)"' container-stack.lock.json
   ```

   Verify that the internal registry has digest-preserved mirrors for every
   image named in the target release `container-stack.lock.json`.

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

7. Update `/etc/kravhantering/release.env` image refs to the new digests on
   every app node.
   Load the target digests from the new release lock file:

   ```bash
   LOCK_FILE=/opt/kravhantering/current/container-stack.lock.json
   service_digest() {
     jq -r --arg name "$1" \
       '.services[] | select(.name == $name) | .digest' "$LOCK_FILE"
   }

   APP_RUNTIME_DIGEST="$(service_digest app-runtime)"
   DB_JOB_DIGEST="$(service_digest db-job)"
   NGINX_DIGEST="$(service_digest nginx)"

   update_ref() {
     sudo sed -i "s#^${1}=.*#${1}=${2}#" /etc/kravhantering/release.env
   }
   ```

   Update the image refs for the internal registry mirror:

   ```bash
   update_ref APP_RUNTIME_IMAGE_REF \
     "registry.example.internal/kravhantering-app-runtime@${APP_RUNTIME_DIGEST}"
   update_ref DB_JOB_IMAGE_REF \
     "registry.example.internal/kravhantering-db-job@${DB_JOB_DIGEST}"
   update_ref NGINX_IMAGE_REF \
     "registry.example.internal/nginx@${NGINX_DIGEST}"
   ```

   Opt-in: if the site is explicitly approved to pull from public upstream
   registries, use the source registry refs instead:

   ```bash
   update_ref APP_RUNTIME_IMAGE_REF \
     "ghcr.io/viscalyx/kravhantering-app-runtime@${APP_RUNTIME_DIGEST}"
   update_ref DB_JOB_IMAGE_REF \
     "ghcr.io/viscalyx/kravhantering-db-job@${DB_JOB_DIGEST}"
   update_ref NGINX_IMAGE_REF \
     "docker.io/library/nginx@${NGINX_DIGEST}"
   ```

   Pull the target images as the service user:

   ```bash
   sudo -iu kravhantering
   set -a
   . /etc/kravhantering/release.env
   set +a

   podman pull "$APP_RUNTIME_IMAGE_REF"
   podman pull "$DB_JOB_IMAGE_REF"
   podman pull "$NGINX_IMAGE_REF"

   exit
   ```

8. Run the database jobs once from the new release.
   Use the DBA-pre-provisioned `db-job.env` values. Do not run
   `db-job bootstrap` during a normal upgrade, and do not run `seed:demo` in
   production.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" wait
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" migrate
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" seed:required

   exit
   ```

9. Start each app node from the new release.
   Start `app-runtime`, confirm the nginx resolver from inside the Compose
   network, then start the full app node:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   COMPOSE_FILE=compose/app-node-tls.compose.yml
   # COMPOSE_FILE=compose/app-node-http.compose.yml
   APP_NODE_NETWORK=kravhantering-app-node_kravhantering-internal

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" up -d app-runtime
   podman run --rm --network "$APP_NODE_NETWORK" --entrypoint /bin/sh \
     "$NGINX_IMAGE_REF" -c "awk '/^nameserver / { print \$2; exit }' /etc/resolv.conf"

   podman compose --env-file /etc/kravhantering/release.env \
     -f "$COMPOSE_FILE" up -d

   exit
   ```

   If the printed resolver differs from `NGINX_RESOLVER`, update
   `/etc/kravhantering/release.env` and rerun the app-node start command
   before checking readiness.

10. Check `/api/health`, `/api/ready`, sign-in and a read-only UI workflow.
    Check readiness through nginx, then sign in through the browser and open an
    existing read-only requirement view:

    ```bash
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    curl --fail --silent --show-error \
      https://kravhantering.example.internal/api/ready
    ```

    If the host uses a self-signed certificate, or the operator workstation
    does not yet trust the issuing CA, use `--insecure` for a manual readiness
    probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

11. Re-enable traffic.
    Put the app nodes back into the load balancer, reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    readiness results to the
    [Operational Evidence](./rhel10-production-deploy.md#operational-evidence)
    record.

## Rollback

Rollback after a migration requires restoring the database backup or restore
point taken before the upgrade. The supported sequence is:

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
   PREVIOUS_VERSION=1.2.3

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
