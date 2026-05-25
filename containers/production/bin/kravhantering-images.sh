#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
DEFAULT_LOCK_FILE="./container-stack.lock.json"
DEFAULT_ENV_FILE="/etc/kravhantering/release.env"
CLEANUP_WORK_DIR=""

usage() {
  cat <<USAGE
Usage:
  ${SCRIPT_NAME} --topology <app-node|single-node|all> [options] verify
  ${SCRIPT_NAME} --topology <app-node|single-node|all> [options] export --output <path>
  ${SCRIPT_NAME} --topology <app-node|single-node|all> [options] load --bundle <path>

Options:
  --lock-file <path>  Release container-stack.lock.json path
  --env-file <path>   release.env path with *_IMAGE_REF values
  --output <path>     Exported offline image bundle path
  --bundle <path>     Offline image bundle to load
USAGE
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

cleanup_work_dir() {
  if [[ -n "$CLEANUP_WORK_DIR" ]]; then
    rm -rf "$CLEANUP_WORK_DIR"
  fi
}

normalize_sha256() {
  case "$1" in
    sha256:*) printf '%s\n' "$1" ;;
    *) printf 'sha256:%s\n' "$1" ;;
  esac
}

service_env_prefix() {
  case "$1" in
    app-runtime) printf 'APP_RUNTIME\n' ;;
    db-job) printf 'DB_JOB\n' ;;
    nginx) printf 'NGINX\n' ;;
    sqlserver) printf 'SQLSERVER\n' ;;
    keycloak) printf 'KEYCLOAK\n' ;;
    *) fail "Unsupported service: $1" ;;
  esac
}

services_for_topology() {
  case "$1" in
    app-node) printf '%s\n' app-runtime db-job nginx ;;
    single-node | all) printf '%s\n' app-runtime db-job nginx sqlserver keycloak ;;
    *) fail "Unsupported topology: $1" ;;
  esac
}

load_release_env() {
  [[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
}

image_ref_for_service() {
  local service="$1"
  local prefix
  prefix="$(service_env_prefix "$service")"
  local var_name="${prefix}_IMAGE_REF"
  local value="${!var_name:-}"
  [[ -n "$value" ]] || fail "$ENV_FILE is missing $var_name."
  printf '%s\n' "$value"
}

locked_image_id() {
  local service="$1"
  local image_id
  image_id="$(jq -r --arg name "$service" '
    if .schemaVersion != 2 then
      error("container-stack.lock.json must use schemaVersion 2")
    else
      .services[] | select(.name == $name) | .imageId
    end
  ' "$LOCK_FILE")"
  [[ "$image_id" != "null" && -n "$image_id" ]] ||
    fail "$LOCK_FILE is missing imageId for $service."
  normalize_sha256 "$image_id"
}

actual_image_id() {
  local image_ref="$1"
  local image_id
  image_id="$(podman image inspect "$image_ref" --format '{{.Id}}')"
  [[ -n "$image_id" ]] || fail "Unable to inspect image ID for $image_ref."
  normalize_sha256 "$image_id"
}

verify_service() {
  local service="$1"
  local image_ref expected actual
  image_ref="$(image_ref_for_service "$service")"
  expected="$(locked_image_id "$service")"
  actual="$(actual_image_id "$image_ref")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$service image ID $actual does not match locked $expected for $image_ref."
  fi
  printf 'Verified %s (%s)\n' "$service" "$image_ref"
}

verify_images() {
  for service in "${SERVICES[@]}"; do
    verify_service "$service"
  done
}

require_tag_ref() {
  local service="$1"
  local image_ref="$2"
  if [[ "$image_ref" == *@sha256:* ]]; then
    fail "$service uses digest ref $image_ref; offline load requires a tag-style *_IMAGE_REF retag target."
  fi
}

write_transport_manifest() {
  local output="$1"
  shift
  jq -n \
    --arg generatedAt "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg topology "$TOPOLOGY" \
    --argjson services "$(
      for service in "$@"; do
        jq -n \
          --arg name "$service" \
          --arg imageRef "$(image_ref_for_service "$service")" \
          --arg imageId "$(locked_image_id "$service")" \
          '{name: $name, imageRef: $imageRef, imageId: $imageId}'
      done | jq -s '.'
    )" \
    '{schemaVersion: 1, generatedAt: $generatedAt, topology: $topology, services: $services}' \
    > "$output"
}

export_images() {
  [[ -n "$OUTPUT_PATH" ]] || fail "export requires --output <path>."
  local output_dir output_path
  output_dir="$(dirname "$OUTPUT_PATH")"
  mkdir -p "$output_dir"
  output_path="$(cd "$output_dir" && pwd)/$(basename "$OUTPUT_PATH")"

  local work_dir
  work_dir="$(mktemp -d)"
  CLEANUP_WORK_DIR="$work_dir"
  trap cleanup_work_dir EXIT
  mkdir -p "$work_dir/images"
  cp "$LOCK_FILE" "$work_dir/container-stack.lock.json"

  for service in "${SERVICES[@]}"; do
    local image_ref
    image_ref="$(image_ref_for_service "$service")"
    podman pull "$image_ref"
    verify_service "$service"
    podman save --format oci-archive \
      --output "$work_dir/images/${service}.oci.tar" \
      "$image_ref"
    gzip --force --best "$work_dir/images/${service}.oci.tar"
  done

  write_transport_manifest "$work_dir/transport-manifest.json" "${SERVICES[@]}"
  (
    cd "$work_dir"
    sha256sum container-stack.lock.json transport-manifest.json images/*.oci.tar.gz \
      > hashes.sha256
    tar -czf "$output_path" container-stack.lock.json transport-manifest.json \
      hashes.sha256 images
  )
  printf 'Wrote %s\n' "$output_path"
}

load_images() {
  [[ -n "$BUNDLE_PATH" ]] || fail "load requires --bundle <path>."
  [[ -f "$BUNDLE_PATH" ]] || fail "Missing bundle: $BUNDLE_PATH"

  local work_dir
  work_dir="$(mktemp -d)"
  CLEANUP_WORK_DIR="$work_dir"
  trap cleanup_work_dir EXIT
  tar -xzf "$BUNDLE_PATH" -C "$work_dir"
  (cd "$work_dir" && sha256sum -c hashes.sha256)

  for service in "${SERVICES[@]}"; do
    local image_ref image_id archive
    image_ref="$(image_ref_for_service "$service")"
    require_tag_ref "$service" "$image_ref"
    image_id="$(locked_image_id "$service")"
    archive="$work_dir/images/${service}.oci.tar.gz"
    [[ -f "$archive" ]] || fail "Bundle is missing $archive."
    podman load --input "$archive"
    podman image inspect "$image_id" >/dev/null
    podman tag "$image_id" "$image_ref"
  done

  verify_images
}

TOPOLOGY=""
LOCK_FILE="$DEFAULT_LOCK_FILE"
ENV_FILE="$DEFAULT_ENV_FILE"
OUTPUT_PATH=""
BUNDLE_PATH=""
COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topology)
      TOPOLOGY="${2:-}"
      shift 2
      ;;
    --lock-file)
      LOCK_FILE="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    --bundle)
      BUNDLE_PATH="${2:-}"
      shift 2
      ;;
    verify | export | load)
      COMMAND="$1"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unexpected argument: $1"
      ;;
  esac
done

[[ -n "$COMMAND" ]] || {
  usage >&2
  fail "Missing command."
}
[[ -n "$TOPOLOGY" ]] || fail "Missing --topology."
[[ -f "$LOCK_FILE" ]] || fail "Missing lock file: $LOCK_FILE"

need_command jq
need_command podman
need_command sha256sum
need_command tar
need_command gzip
load_release_env
SERVICES=()
while IFS= read -r service; do
  SERVICES+=("$service")
done < <(services_for_topology "$TOPOLOGY")

case "$COMMAND" in
  verify) verify_images ;;
  export) export_images ;;
  load) load_images ;;
  *) fail "Unsupported command: $COMMAND" ;;
esac
