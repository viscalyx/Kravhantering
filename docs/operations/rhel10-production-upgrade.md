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

The HSA verification quota is coordinated in SQL Server. Drain and stop every
app node before applying its migration, and start only releases that implement
the shared quota. A mixed deployment with older per-process counters is not
supported. The migration and runtime-permission reconciliation must complete
before any app node starts; no new service, secret or operator setting is
required.

>[!IMPORTANT]
>Before the downtime window, create the mandatory site-specific
>[readiness probe boundary](./readiness-probe-boundary.md) and add its path to
>`/etc/kravhantering/release.env`. The target release refuses to render or
>install every topology without this file. Verify readiness from an allowed
>monitoring source and denial from another source after rollout.

When the target release enables connection-managed AI, provision and back up
the external provider-secret root keyring before migration. Keep every version
referenced by current rows or retained database backups, mount it read-only on
every app node, and test database plus keyring restore as one recovery set.
Follow [AI Connections Operations](./ai-connections.md); do not place root keys
in `app.env` or release artifacts.

If the site enables HSA person lookup, review `app.env` before the cutover.
`HSA_PERSON_LOOKUP_URL` requires the complete strict mTLS tuple: a private CA,
role-specific client certificate and key, and the exact TLS server name, all
on deployment-owned read-only mounts. The supported connection uses mTLS
without certificate-validation bypasses or OAuth-only authentication. Leave
the URL unset when live lookup is not configured; the App remains ready and
reports lookup unavailable. Verify this local readiness and the authenticated
capability operation before restoring traffic. Rollback must restore the prior
App image and its matching strict material as one unit.

Set `AI_REQUIREMENT_GENERATION_DISABLED=1` on every app node before draining
traffic, even when AI is already suspended in Admin Center. Keep it active
through migration, required seeding, startup, restore testing, and application
smoke checks. The environment guard is the upgrade and rollback boundary; it
does not affect health or readiness.

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

4. Stop `nginx` and `app-runtime` on every app node by stopping the current
   Quadlet target:

   ```bash
   sudo -iu kravhantering
   systemctl --user stop kravhantering-app-node.target
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
     "/opt/kravhantering/releases/${VERSION}/nginx" \
     "/opt/kravhantering/releases/${VERSION}/api-docs"
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
     "$DB_JOB_IMAGE_REF" permission-status \
     > "$EVIDENCE_DIR/runtime-permissions-${VERSION}.json"
   podman run --rm --env-file /etc/kravhantering/db-job.env \
     "$DB_JOB_IMAGE_REF" seed:required

   exit
   ```

9. Start each app node from the new release. Select the same TLS or HTTP
   topology used on this host, install its concrete Quadlet files, and start
   `app-runtime` first:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   TOPOLOGY=app-node-tls
   # TOPOLOGY=app-node-http
   bin/kravhantering-quadlet.sh install --topology "$TOPOLOGY"
   systemctl --user daemon-reload
   systemctl --user start kravhantering-app-runtime.service

   exit
   ```

   Verify generated-output temporary storage from inside `app-runtime` before
   starting nginx. If `KRAVHANTERING_EXPORT_TEMP_DIR` is unset or blank in
   `/etc/kravhantering/app.env`, the printed path is the container
   operating-system temporary directory; the fallback must still have the
   required permissions and capacity. The probe runs as the non-root Node.js
   account, verifies read/write/search access, and creates and removes a file:

   ```bash
   sudo -iu kravhantering
   podman exec -i kravhantering-app-runtime node <<'NODE'
   const fs = require('node:fs')
   const os = require('node:os')
   const path = require('node:path')

   const configured = process.env.KRAVHANTERING_EXPORT_TEMP_DIR?.trim()
   const directory = configured || os.tmpdir()
   fs.accessSync(
     directory,
     fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK,
   )
   const probeDirectory = fs.mkdtempSync(
     path.join(directory, 'kravhantering-storage-check-'),
   )
   try {
     const probeFile = path.join(probeDirectory, 'probe')
     fs.writeFileSync(probeFile, 'ready', { mode: 0o600 })
   } finally {
     fs.rmSync(probeDirectory, { recursive: true })
   }
   const stats = fs.statfsSync(directory, { bigint: true })
   const availableBytes = stats.bavail * stats.bsize
   const availableGiB = Number(availableBytes) / 1024 ** 3
   console.log(`Temporary directory: ${directory}`)
   console.log(`Available: ${availableBytes} bytes (${availableGiB.toFixed(2)} GiB)`)
   NODE

   exit
   ```

   Do not continue if the probe fails. Confirm that the reported available
   space is at least:

   ```text
   (CSV concurrency per node × CSV maximum file bytes)
   + (PDF concurrency per node × PDF maximum file bytes)
   + site-approved filesystem headroom
   ```

   Use the application settings planned for this environment. The built-in
   defaults require 650 MiB before filesystem headroom. `/api/ready` repeats
   the create/write/remove check, but capacity planning remains an operator
   check.

   Confirm the nginx resolver from inside the edge Quadlet network. Resolve
   its stable Podman name through the helper.

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   set -a
   . /etc/kravhantering/release.env
   set +a

   TOPOLOGY=app-node-tls
   # TOPOLOGY=app-node-http
   RESOLVER_IP="$(
     bin/kravhantering-quadlet.sh print-resolver \
       --topology "$TOPOLOGY" --purpose edge
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

   The resolver can change when the internal Quadlet network is recreated or
   assigned another subnet.

   Start the full app node:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   TOPOLOGY=app-node-tls
   # TOPOLOGY=app-node-http
   bin/kravhantering-quadlet.sh install --topology "$TOPOLOGY"
   systemctl --user daemon-reload
   systemctl --user enable --now kravhantering-app-node.target

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

    If the host uses a self-signed certificate, or the operator workstation
    does not yet trust the issuing CA, use `--insecure` for a manual readiness
    probe only:

    ```bash
    curl --insecure --fail --silent --show-error \
      https://kravhantering.example.internal/api/health
    ```

    The Quadlet networks retain the established
    `kravhantering-app-node_edge` and `kravhantering-app-node_egress` names.

11. Re-enable traffic.
    Put the app nodes back into the load balancer, reverse proxy or firewall
    rotation only after the readiness probes and read-only workflow succeed.
    Add the final bundle checksum, image refs, restore-point reference and
    `migration-status-before-<version>.json`,
    `migration-run-<version>.json`,
    `migration-status-after-<version>.json`,
    `runtime-permissions-<version>.json` and readiness results to the
    [Operational Evidence](./rhel10-production-deploy.md#operational-evidence)
    record.

    Leave AI blocked while normal application traffic returns. If the intended
    AI profiles should be enabled in this release, complete the
    [AI deployment evidence gate](./ai-connections.md#deployment-evidence-gate),
    change the guard to `0` on every app node, recreate app-runtime, and verify
    effective AI availability. A failed gate does not block the non-AI release.

## Rollback

Set `AI_REQUIREMENT_GENERATION_DISABLED=1` in the restored app configuration
before starting either release. Rollback may suspend an affected connection or
profile, or select a still-usable verified model revision on the stable profile.
The direct OpenRouter route does not exist. When a database restore is required,
restore its matching external root-key versions before any AI verification and
repeat the deployment evidence gate before releasing the guard.

Choose the rollback boundary that matches the failed step:

The selected rollback release must already support the shared SQL-backed HSA
verification quota. A release with per-process HSA verification counters is
not eligible for production rollback, regardless of whether its matching
pre-upgrade database state is available. If no eligible rollback release and
database restore point exist, keep traffic drained and forward-fix the target
release.

- Before the current Quadlet target is stopped, no runtime migration has
  occurred. Leave the current release active and end the change window.
- After the previous deployment is stopped but before database migration,
  remove the new Quadlet units and start the eligible previous release without a
  database restore.
- After any target-release database migration starts, restore the tested
  pre-upgrade database restore point before starting the eligible previous release.
  Do not run individual migration down paths. Restore schema, data,
  permissions, and role memberships as one database state.

For either rollback that follows a failed Quadlet start:

1. Disable traffic and stop the new target on every app node.

   ```bash
   sudo -iu kravhantering
   systemctl --user disable --now kravhantering-app-node.target
   exit
   ```

2. If migration started, restore SQL Server to the recorded pre-upgrade
   restore point. Use the captured migration evidence to confirm the boundary.

3. Point `/opt/kravhantering/current` back to the eligible previous release directory
   on every app node.

   ```bash
   PREVIOUS_VERSION=1.2.3 # Change to the previous version being restored.

   sudo ln -sfn "/opt/kravhantering/releases/${PREVIOUS_VERSION}" \
     /opt/kravhantering/current
   readlink -f /opt/kravhantering/current
   ```

4. Restore the eligible previous `/etc/kravhantering/release.env` image refs
   on every app node.
   Use the release evidence record or rerun the image-reference update with
   the previous release's `container-stack.lock.json`.

5. Install the eligible previous release's Quadlet topology, reload systemd,
   and start the previous app nodes:

   ```bash
   sudo -iu kravhantering
   cd /opt/kravhantering/current
   TOPOLOGY=app-node-tls
   # TOPOLOGY=app-node-http
   bin/kravhantering-quadlet.sh install --topology "$TOPOLOGY"
   systemctl --user daemon-reload
   systemctl --user enable --now kravhantering-app-node.target
   exit
   ```

6. Verify `/api/health`, `/api/ready` and sign-in before enabling traffic.

Do not rely on app-only image rollback after schema migration unless the
specific release notes explicitly say it is supported.

Never start a release with per-process HSA verification counters as a
production rollback. After upgrade or an eligible rollback, verify the
existing SQL and migration readiness signal, the
`hsa_verification_quota_buckets` cleanup target, and HSA verification capacity
events before restoring traffic.

### MCP validation-session ownership migration

The migration that adds principal ownership and atomic quotas is intentionally
fail closed. Its upgrade deletes every existing
`requirement_import_validation_sessions` row before adding the creator
fingerprint and reservation columns; its rollback also deletes all sessions
before removing them. Existing validation tokens cannot survive either
direction. The migration also adds the short-lived creation-rate table and four
`ai_settings` quota columns.

Keep all app nodes drained and stopped while the database job runs. Mixed old
and new app versions are unsupported because the old version performs
token-only lookup and does not participate in the new atomic quota protocol.
After upgrade or rollback, tell MCP users to run `validate` again. Verify all
four Admin settings, the runtime permission manifest, one same-principal
inspect, one wrong-principal not-found result, and the transient cleanup target
before restoring traffic.

Rotating `AUTH_SESSION_COOKIE_PASSWORD` derives a new principal-fingerprint
key. Treat rotation as intentional validation-token invalidation: drain MCP
traffic, rotate every app node together, restart them, and tell clients to
revalidate. Do not retain the old secret solely to preserve transient sessions.

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

5. Restart `app-runtime` on every app node. Restart nginx as well so the edge
   does not keep a stale upstream address after the app container changes:

   ```bash
   sudo -iu kravhantering
   systemctl --user restart kravhantering-app-runtime.service
   systemctl --user restart kravhantering-nginx.service

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

## Release-Independent Cleanup During Upgrade

Before downtime, complete the compatibility and recovery-set preflight in
[Release-Independent Transient-State Cleanup](transient-state-cleanup.md).
Pause the retained host manager before migration or restore. Application
rollback preserves its selected image and schedule; do not remove its units.
Require a successful `resume` and active timer before operational handoff.
