# RHEL 10 Self-Contained Single-Node Disconnected Deployment And Upgrade

<!-- cSpell:words coreutils fLO readlink resolv -->

This guide describes how to prepare and import disconnected release artifacts
for the self-contained single-node RHEL 10 production topology, where nginx,
`app-runtime`, SQL Server, Keycloak and `db-job` run in one rootless Podman
Compose network.

The default disconnected topology is `single-node`. The optional
`single-node-demo` topology is test-only and adds Kong, the HSA person lookup
adapter and the HSA directory mock from
`container-hsa-integration-support.lock.json` and
`container-test-support.lock.json`. Use `single-node-demo` only for release
smoke, disposable demos or other non-production environments.

The standard `single-node` and `single-node-demo` disconnected image bundles do
not include the optional `kravhantering-demo-seed` image. Treat demo seed as a
separate opt-in demonstration artifact if a disposable offline demo environment
needs it.

Use this guide before starting a first install in a disconnected environment
with
[rhel10-production-single-node-self-contained-deploy.md](./rhel10-production-single-node-self-contained-deploy.md),
or before the downtime window for a disconnected planned upgrade with
[rhel10-production-single-node-self-contained-upgrade.md](./rhel10-production-single-node-self-contained-upgrade.md).

![Disconnected Bundle Journey](images/disconnected-release-bundle-journey.png)

## Connected Export Host

The connected export host only prepares transferable artifacts. Do not create
the `kravhantering` service user there, and do not create production
`/opt/kravhantering` or `/etc/kravhantering` directories there.

The export host needs:

- outbound access to the approved release repository
- outbound access to the approved image registry or mirror
- `podman`, `tar`, `gzip`, `coreutils`, `jq` and `curl`
- one operator account that runs all `podman pull`, verify and export commands

Podman image storage is per user. Pull, verify and export images with the same
connected-host account.

### Create The Disconnected Bundle

Set the release version and download source:

```bash
VERSION=1.2.3 # Change to the version being deployed.
TOPOLOGY=single-node
# Test/demo only: set TOPOLOGY=single-node-demo.
INCLUDE_DEMO_SEED=false
# Disposable offline demo only: set INCLUDE_DEMO_SEED=true.

# Default: internal release repository.
RELEASE_DOWNLOAD_URL="https://release.example.internal/kravhantering/${VERSION}"

# Opt-in: official GitHub release.
# RELEASE_DOWNLOAD_URL="https://github.com/viscalyx/Kravhantering/releases/download/v${VERSION}"

OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
OFFLINE_WORK="/tmp/kravhantering-offline-work-${VERSION}-${TOPOLOGY}"
OFFLINE_BUNDLE="${OFFLINE_ROOT}.tar.gz"
RELEASE_ARCHIVE="kravhantering-production-deploy-${VERSION}.tar.gz"
IMAGE_BUNDLE_NAME="kravhantering-images-${VERSION}-${TOPOLOGY}.tar.gz"
DEMO_SEED_ARCHIVE_NAME="kravhantering-demo-seed-${VERSION}.oci.tar.gz"

# Start from a clean staging area for this version and topology.
rm -rf -- "$OFFLINE_ROOT" "$OFFLINE_WORK"
mkdir -p "$OFFLINE_ROOT/release" "$OFFLINE_ROOT/images" "$OFFLINE_WORK"
cd "$OFFLINE_ROOT/release"

curl -fLO "${RELEASE_DOWNLOAD_URL}/${RELEASE_ARCHIVE}"
curl -fLO "${RELEASE_DOWNLOAD_URL}/${RELEASE_ARCHIVE}.sha256"
sha256sum -c "${RELEASE_ARCHIVE}.sha256"

tar -xzf "$RELEASE_ARCHIVE" -C "$OFFLINE_WORK" --strip-components=1
cp "$OFFLINE_WORK/env/release.env.template" "$OFFLINE_ROOT/release.env"
```

Set image refs in the staging `release.env` before pulling images. Choose
exactly one of alternatives A, B or C, depending on the repository layout the
connected export host can pull from.

#### Alternative A: Public Upstream Refs

Use this when the connected export host is approved to pull public upstream
refs directly. Derive refs from the release lock:

```bash
update_ref() {
  sed -i "s#^${1}=.*#${1}=${2}#" "$OFFLINE_ROOT/release.env"
}

LOCK_FILE="$OFFLINE_WORK/container-stack.lock.json"
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

#### Alternative B: Internal Mirror With Preserved Paths

Use this when the connected export host pulls from an internal mirror that
preserves repository paths. Rewrite only the registry host:

```bash
TARGET_IMAGE_REGISTRY=registry.example.internal
update_ref() {
  sed -i "s#^${1}=.*#${1}=${2}#" "$OFFLINE_ROOT/release.env"
}

LOCK_FILE="$OFFLINE_WORK/container-stack.lock.json"
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

#### Alternative C: Custom Repository Layout

Use this when the connected export host pulls from an internal mirror with a
custom repository layout. Edit the five `*_IMAGE_REF` values in
`$OFFLINE_ROOT/release.env` manually before continuing.

#### Optional Test Support Refs For `single-node-demo`

Use this only when `TOPOLOGY=single-node-demo`. Kong and the adapter refs come
from `container-hsa-integration-support.lock.json`; the HSA directory mock ref
comes from `container-test-support.lock.json`. They are not part of the
production `single-node` topology.

After Alternative A or B, run:

```bash
if [ "$TOPOLOGY" = "single-node-demo" ]; then
  HSA_LOCK_FILE="$OFFLINE_WORK/container-hsa-integration-support.lock.json"
  TEST_LOCK_FILE="$OFFLINE_WORK/container-test-support.lock.json"
  support_service_ref() {
    local lock_file name image tag
    lock_file="$1"
    name="$2"
    image="$(jq -r --arg name "$name" \
      '.services[] | select(.name == $name) | .image' "$lock_file")"
    tag="$(jq -r --arg name "$name" \
      '.services[] | select(.name == $name) | .tag' "$lock_file")"
    if [ -n "${TARGET_IMAGE_REGISTRY:-}" ]; then
      printf '%s/%s:%s\n' \
        "$TARGET_IMAGE_REGISTRY" "${image#*/}" "$tag"
      return
    fi
    printf '%s:%s\n' "$image" "$tag"
  }

  update_ref KONG_IMAGE_REF \
    "$(support_service_ref "$HSA_LOCK_FILE" kong)"
  update_ref HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF \
    "$(support_service_ref "$HSA_LOCK_FILE" hsa-person-lookup-adapter)"
  update_ref HSA_DIRECTORY_MOCK_IMAGE_REF \
    "$(support_service_ref "$TEST_LOCK_FILE" hsa-directory-mock)"
fi
```

For Alternative C, manually edit `KONG_IMAGE_REF`,
`HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF` and `HSA_DIRECTORY_MOCK_IMAGE_REF` as
well.

#### Optional Demo Seed Image

Use this only for disposable offline demo environments where operators need to
run `seed:demo` or `demo:clear` without network access. The demo seed image is
not part of `container-stack.lock.json`, `release.env.template` or the standard
image helper bundle, so it is carried as a separate OCI archive inside the
offline package.

Set `INCLUDE_DEMO_SEED=true`, then choose the exact demo seed image ref from
the release notes section `Demonstration Container Images` or from your
internal mirror:

```bash
if [ "$INCLUDE_DEMO_SEED" = "true" ]; then
  # Alternative A, public upstream refs:
  DEMO_SEED_IMAGE_REF="ghcr.io/viscalyx/kravhantering-demo-seed:${VERSION}"

  # Alternative B, internal mirror with preserved paths:
  # DEMO_SEED_IMAGE_REF="${TARGET_IMAGE_REGISTRY}/viscalyx/kravhantering-demo-seed:${VERSION}"

  # Alternative C, custom repository layout:
  # DEMO_SEED_IMAGE_REF="registry.example.internal/custom/kravhantering-demo-seed:${VERSION}"
fi
```

### Pull, Verify And Export Images

After completing exactly one image-ref alternative above, the optional test
support refs when `TOPOLOGY=single-node-demo`, and the optional demo seed ref,
pull, verify and export the images with the same connected-host account. Do not
prefix the helper commands with `sudo`; they must use the same Podman image
store as the pull commands. The `bash` invocation also works when `/tmp` is
mounted `noexec`:

```bash
set -a
. "$OFFLINE_ROOT/release.env"
set +a

podman pull "$APP_RUNTIME_IMAGE_REF"
podman pull "$DB_JOB_IMAGE_REF"
podman pull "$NGINX_IMAGE_REF"
podman pull "$SQLSERVER_IMAGE_REF"
podman pull "$KEYCLOAK_IMAGE_REF"

SUPPORT_LOCK_ARGS=()
if [ "$TOPOLOGY" = "single-node-demo" ]; then
  podman pull "$KONG_IMAGE_REF"
  podman pull "$HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF"
  podman pull "$HSA_DIRECTORY_MOCK_IMAGE_REF"
  SUPPORT_LOCK_ARGS=(
    --hsa-integration-lock-file \
    "$OFFLINE_WORK/container-hsa-integration-support.lock.json"
    --test-lock-file "$OFFLINE_WORK/container-test-support.lock.json"
  )
fi

DEMO_SEED_ARCHIVE_PATH=""
DEMO_SEED_MANIFEST_REF=""
if [ "$INCLUDE_DEMO_SEED" = "true" ]; then
  : "${DEMO_SEED_IMAGE_REF:?Set DEMO_SEED_IMAGE_REF before exporting demo seed.}"
  DEMO_SEED_ARCHIVE_PATH="images/$DEMO_SEED_ARCHIVE_NAME"
  DEMO_SEED_MANIFEST_REF="$DEMO_SEED_IMAGE_REF"
  podman pull "$DEMO_SEED_IMAGE_REF"
  podman save --format oci-archive \
    --output "$OFFLINE_ROOT/images/${DEMO_SEED_ARCHIVE_NAME%.gz}" \
    "$DEMO_SEED_IMAGE_REF"
  gzip --force --best "$OFFLINE_ROOT/images/${DEMO_SEED_ARCHIVE_NAME%.gz}"
fi

bash "$OFFLINE_WORK/bin/kravhantering-images.sh" --topology "$TOPOLOGY" \
  --lock-file "$OFFLINE_WORK/container-stack.lock.json" \
  "${SUPPORT_LOCK_ARGS[@]}" \
  --env-file "$OFFLINE_ROOT/release.env" \
  verify

bash "$OFFLINE_WORK/bin/kravhantering-images.sh" --topology "$TOPOLOGY" \
  --lock-file "$OFFLINE_WORK/container-stack.lock.json" \
  "${SUPPORT_LOCK_ARGS[@]}" \
  --env-file "$OFFLINE_ROOT/release.env" \
  export --output "$OFFLINE_ROOT/images/$IMAGE_BUNDLE_NAME"
```

Write the bundle manifest, checksums and movable bundle:

```bash
jq -n \
  --arg version "$VERSION" \
  --arg topology "$TOPOLOGY" \
  --arg releaseArchive "release/$RELEASE_ARCHIVE" \
  --arg releaseChecksum "release/${RELEASE_ARCHIVE}.sha256" \
  --arg imageBundle "images/$IMAGE_BUNDLE_NAME" \
  --arg appRuntime "$APP_RUNTIME_IMAGE_REF" \
  --arg dbJob "$DB_JOB_IMAGE_REF" \
  --arg nginx "$NGINX_IMAGE_REF" \
  --arg sqlserver "$SQLSERVER_IMAGE_REF" \
  --arg keycloak "$KEYCLOAK_IMAGE_REF" \
  --arg kong "${KONG_IMAGE_REF:-}" \
  --arg hsaDirectoryMock "${HSA_DIRECTORY_MOCK_IMAGE_REF:-}" \
  --arg demoSeed "$DEMO_SEED_MANIFEST_REF" \
  --arg demoSeedArchive "$DEMO_SEED_ARCHIVE_PATH" \
  '({
    schemaVersion: 1,
    kind: "kravhantering-offline-bundle",
    version: $version,
    topology: $topology,
    releaseArchive: $releaseArchive,
    releaseChecksum: $releaseChecksum,
    imageBundle: $imageBundle,
    imageRefs: (({
      "app-runtime": $appRuntime,
      "db-job": $dbJob,
      nginx: $nginx,
      sqlserver: $sqlserver,
      keycloak: $keycloak
    } + (if $topology == "single-node-demo" then {
      kong: $kong,
      "hsa-directory-mock": $hsaDirectoryMock
    } else {} end)) +
    (if $demoSeed != "" then {
      "demo-seed": $demoSeed
    } else {} end))
  } + (if $demoSeedArchive != "" then {
    demoSeedArchive: $demoSeedArchive
  } else {} end))' > "$OFFLINE_ROOT/offline-manifest.json"

(
  cd "$OFFLINE_ROOT"
  HASH_INPUTS=(
    offline-manifest.json
    "release/$RELEASE_ARCHIVE"
    "release/${RELEASE_ARCHIVE}.sha256"
    "images/$IMAGE_BUNDLE_NAME"
  )
  if [ -n "$DEMO_SEED_ARCHIVE_PATH" ]; then
    HASH_INPUTS+=("$DEMO_SEED_ARCHIVE_PATH")
  fi
  sha256sum "${HASH_INPUTS[@]}" > hashes.sha256
)

tar -czf "$OFFLINE_BUNDLE" \
  -C "$(dirname "$OFFLINE_ROOT")" "$(basename "$OFFLINE_ROOT")"
(
  cd "$(dirname "$OFFLINE_BUNDLE")"
  sha256sum "$(basename "$OFFLINE_BUNDLE")" \
    > "$(basename "$OFFLINE_BUNDLE").sha256"
)
```

Optional: after the `.tar.gz` and `.sha256` files exist, remove the staging
directories to reclaim `/tmp` space on the connected export host. Keep
`$OFFLINE_BUNDLE` and `${OFFLINE_BUNDLE}.sha256`; those are the files to
transfer:

```bash
test -f "$OFFLINE_BUNDLE"
test -f "${OFFLINE_BUNDLE}.sha256"
rm -rf -- "$OFFLINE_ROOT" "$OFFLINE_WORK"
```

Transfer `$OFFLINE_BUNDLE` and `${OFFLINE_BUNDLE}.sha256` to `/tmp` on the
disconnected host with the site's approved transfer procedure.

## First Install Import

Before importing, complete
[Prepare RHEL 10 Host](./rhel10-production-single-node-self-contained-deploy.md#prepare-rhel-10-host)
on the disconnected host. Do not run the regular guide's connected
`Install a Release` or `Image References` sections.

Unpack and verify the disconnected bundle:

```bash
VERSION=1.2.3 # Change to the version being deployed.
TOPOLOGY=single-node
# Test/demo only: set TOPOLOGY=single-node-demo.
OFFLINE_BUNDLE="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}.tar.gz"
OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
RELEASE_ARCHIVE="kravhantering-production-deploy-${VERSION}.tar.gz"
IMAGE_BUNDLE_NAME="kravhantering-images-${VERSION}-${TOPOLOGY}.tar.gz"

# Start from a clean staging area for this version and topology.
rm -rf -- "$OFFLINE_ROOT"
mkdir -p "$OFFLINE_ROOT"
(
  cd "$(dirname "$OFFLINE_BUNDLE")"
  sha256sum -c "$(basename "$OFFLINE_BUNDLE").sha256"
)
tar -xzf "$OFFLINE_BUNDLE" -C "$OFFLINE_ROOT" --strip-components=1
(cd "$OFFLINE_ROOT" && sha256sum -c hashes.sha256)
(cd "$OFFLINE_ROOT/release" && sha256sum -c "${RELEASE_ARCHIVE}.sha256")
```

Install the release and copy first-install templates:

```bash
test ! -e "/opt/kravhantering/releases/${VERSION}" || {
  echo "Release directory already exists:" \
    "/opt/kravhantering/releases/${VERSION}" >&2
  exit 1
}

sudo install -d -o root -g root -m 0755 \
  "/opt/kravhantering/releases/${VERSION}"
sudo tar -xzf "$OFFLINE_ROOT/release/$RELEASE_ARCHIVE" \
  -C "/opt/kravhantering/releases/${VERSION}" \
  --strip-components=1
sudo ln -sfn "/opt/kravhantering/releases/${VERSION}" \
  /opt/kravhantering/current

REALM_TEMPLATE=/opt/kravhantering/current/keycloak
REALM_TEMPLATE="${REALM_TEMPLATE}/realm-kravhantering-production.template.json"

sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/release.env.template \
  /etc/kravhantering/release.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/app.env.template \
  /etc/kravhantering/app.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/db-job.env.template \
  /etc/kravhantering/db-job.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/sqlserver.env.template \
  /etc/kravhantering/sqlserver.env
sudo install -o root -g kravhantering -m 0640 \
  /opt/kravhantering/current/env/keycloak.env.template \
  /etc/kravhantering/keycloak.env
sudo install -o root -g kravhantering -m 0640 \
  "$REALM_TEMPLATE" \
  /etc/kravhantering/keycloak/realm-kravhantering-production.json

sudo chcon -R -t container_file_t \
  "/opt/kravhantering/releases/${VERSION}/nginx"
```

Set disconnected image refs. By default this preserves the source refs recorded
in the bundle manifest. Set `TARGET_IMAGE_REGISTRY` before running the block if
the disconnected host should use a local or non-resolvable registry hostname:

```bash
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

Load, tag and verify the images as the rootless service user:

```bash
sudo -iu kravhantering
VERSION=1.2.3 # Change to the version being deployed.
TOPOLOGY=single-node
# Test/demo only: set TOPOLOGY=single-node-demo.
OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
IMAGE_BUNDLE_NAME="kravhantering-images-${VERSION}-${TOPOLOGY}.tar.gz"
# Set this to the same local registry host if loaded images are retagged.
TARGET_IMAGE_REGISTRY="${TARGET_IMAGE_REGISTRY:-}"
cd /opt/kravhantering/current
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
  load --bundle "$OFFLINE_ROOT/images/$IMAGE_BUNDLE_NAME"

DEMO_SEED_ARCHIVE="$(jq -r '.demoSeedArchive // empty' \
  "$OFFLINE_ROOT/offline-manifest.json")"
if [ -n "$DEMO_SEED_ARCHIVE" ]; then
  DEMO_SEED_SOURCE_REF="$(jq -r '.imageRefs["demo-seed"]' \
    "$OFFLINE_ROOT/offline-manifest.json")"
  DEMO_SEED_IMAGE_REF="$DEMO_SEED_SOURCE_REF"
  if [ -n "$TARGET_IMAGE_REGISTRY" ]; then
    tag="${DEMO_SEED_SOURCE_REF##*:}"
    path="${DEMO_SEED_SOURCE_REF%:*}"
    DEMO_SEED_IMAGE_REF="${TARGET_IMAGE_REGISTRY}/${path#*/}:${tag}"
  fi
  podman load --input "$OFFLINE_ROOT/$DEMO_SEED_ARCHIVE"
  if [ "$DEMO_SEED_IMAGE_REF" != "$DEMO_SEED_SOURCE_REF" ]; then
    podman tag "$DEMO_SEED_SOURCE_REF" "$DEMO_SEED_IMAGE_REF"
  fi
  printf 'Use DEMO_SEED_IMAGE_REF=%s for seed:demo or demo:clear.\n' \
    "$DEMO_SEED_IMAGE_REF"
fi
exit
```

Resume the regular deployment guide at
[Configure Single-Node Services](./rhel10-production-single-node-self-contained-deploy.md#configure-single-node-services).
Keep the copied `/etc/kravhantering/release.env` and edit only the normal
site-specific values from the regular guide.

## Upgrade Import

Create and transfer the disconnected bundle before the downtime window. During
the window, follow the regular upgrade guide for backup, traffic drain and
service stop. Then use this section instead of the connected artifact install
and image-pull steps.

Unpack and verify the disconnected bundle:

```bash
VERSION=1.2.4 # Change to the version being deployed.
TOPOLOGY=single-node
# Test/demo only: set TOPOLOGY=single-node-demo.
OFFLINE_BUNDLE="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}.tar.gz"
OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
RELEASE_ARCHIVE="kravhantering-production-deploy-${VERSION}.tar.gz"
IMAGE_BUNDLE_NAME="kravhantering-images-${VERSION}-${TOPOLOGY}.tar.gz"

# Start from a clean staging area for this version and topology.
rm -rf -- "$OFFLINE_ROOT"
mkdir -p "$OFFLINE_ROOT"
(
  cd "$(dirname "$OFFLINE_BUNDLE")"
  sha256sum -c "$(basename "$OFFLINE_BUNDLE").sha256"
)
tar -xzf "$OFFLINE_BUNDLE" -C "$OFFLINE_ROOT" --strip-components=1
(cd "$OFFLINE_ROOT" && sha256sum -c hashes.sha256)
(cd "$OFFLINE_ROOT/release" && sha256sum -c "${RELEASE_ARCHIVE}.sha256")
```

Install the target release and move `current`:

```bash
test ! -e "/opt/kravhantering/releases/${VERSION}" || {
  echo "Release directory already exists:" \
    "/opt/kravhantering/releases/${VERSION}" >&2
  exit 1
}

sudo install -d -o root -g root -m 0755 \
  "/opt/kravhantering/releases/${VERSION}"
sudo tar -xzf "$OFFLINE_ROOT/release/$RELEASE_ARCHIVE" \
  -C "/opt/kravhantering/releases/${VERSION}" \
  --strip-components=1
sudo chcon -R -t container_file_t \
  "/opt/kravhantering/releases/${VERSION}/nginx"
sudo ln -sfn "/opt/kravhantering/releases/${VERSION}" \
  /opt/kravhantering/current
readlink -f /opt/kravhantering/current
```

Update only the image refs in the existing `/etc/kravhantering/release.env`:

```bash
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

Load, tag and verify the images as the rootless service user:

```bash
sudo -iu kravhantering
VERSION=1.2.4 # Change to the version being deployed.
TOPOLOGY=single-node
# Test/demo only: set TOPOLOGY=single-node-demo.
OFFLINE_ROOT="/tmp/kravhantering-offline-${VERSION}-${TOPOLOGY}"
IMAGE_BUNDLE_NAME="kravhantering-images-${VERSION}-${TOPOLOGY}.tar.gz"
# Set this to the same local registry host if loaded images are retagged.
TARGET_IMAGE_REGISTRY="${TARGET_IMAGE_REGISTRY:-}"
cd /opt/kravhantering/current
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
  load --bundle "$OFFLINE_ROOT/images/$IMAGE_BUNDLE_NAME"

DEMO_SEED_ARCHIVE="$(jq -r '.demoSeedArchive // empty' \
  "$OFFLINE_ROOT/offline-manifest.json")"
if [ -n "$DEMO_SEED_ARCHIVE" ]; then
  DEMO_SEED_SOURCE_REF="$(jq -r '.imageRefs["demo-seed"]' \
    "$OFFLINE_ROOT/offline-manifest.json")"
  DEMO_SEED_IMAGE_REF="$DEMO_SEED_SOURCE_REF"
  if [ -n "$TARGET_IMAGE_REGISTRY" ]; then
    tag="${DEMO_SEED_SOURCE_REF##*:}"
    path="${DEMO_SEED_SOURCE_REF%:*}"
    DEMO_SEED_IMAGE_REF="${TARGET_IMAGE_REGISTRY}/${path#*/}:${tag}"
  fi
  podman load --input "$OFFLINE_ROOT/$DEMO_SEED_ARCHIVE"
  if [ "$DEMO_SEED_IMAGE_REF" != "$DEMO_SEED_SOURCE_REF" ]; then
    podman tag "$DEMO_SEED_SOURCE_REF" "$DEMO_SEED_IMAGE_REF"
  fi
  printf 'Use DEMO_SEED_IMAGE_REF=%s for seed:demo or demo:clear.\n' \
    "$DEMO_SEED_IMAGE_REF"
fi
exit
```

Resume the regular upgrade guide at the database job step. Continue with the
single-node database job and stack-start sequence from the regular guide.
