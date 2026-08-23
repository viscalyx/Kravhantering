#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-/usr/local/lib/codex}"
CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR:-/usr/local/bin}"
CODEX_NON_INTERACTIVE="${CODEX_NON_INTERACTIVE:-1}"
CODEX_MANAGED_DIRECTORY_MODE="${CODEX_MANAGED_DIRECTORY_MODE:-0755}"

log() {
  printf '[codex-installer] %s\n' "$*" >&2
}

codex_temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/krav-codex-installer.XXXXXX")"
cleanup() {
  rm -rf "${codex_temp_dir}"
}
trap cleanup EXIT

codex_installer="${codex_temp_dir}/install.sh"
codex_release_json="${codex_temp_dir}/release.json"
codex_curl_options=(
  --fail
  --silent
  --show-error
  --location
  --connect-timeout 10
  --max-time 120
  --retry 3
  --retry-delay 2
  --retry-all-errors
)
codex_curl() {
  if [ -n "${GH_TOKEN:-}" ]; then
    if [[ "${GH_TOKEN}" == *$'\n'* || "${GH_TOKEN}" == *$'\r'* ]]; then
      log 'GitHub token contains invalid characters'
      return 1
    fi
    printf 'Authorization: Bearer %s\n' "${GH_TOKEN}" |
      curl "${codex_curl_options[@]}" --header @- "$@"
    return
  fi
  curl "${codex_curl_options[@]}" "$@"
}

codex_curl \
  --output "${codex_release_json}" \
  https://api.github.com/repos/openai/codex/releases/latest

if ! codex_release_tag="$(
  jq -er \
    'select(.draft == false and .prerelease == false) |
      .tag_name | select(test("^rust-v[0-9]+\\.[0-9]+\\.[0-9]+$"))' \
    "${codex_release_json}"
)" ||
  ! codex_installer_sha256="$(
    jq -er \
      '[.assets[] | select(.name == "install.sh") | .digest |
        select(test("^sha256:[0-9a-fA-F]{64}$"))] |
        if length == 1 then .[0] | sub("^sha256:"; "")
        else error("missing unique install.sh SHA-256 digest") end' \
      "${codex_release_json}"
  )"; then
  log 'Could not resolve the latest Codex installer and digest'
  exit 1
fi
codex_version="${codex_release_tag#rust-v}"

codex_curl \
  --output "${codex_installer}" \
  "https://github.com/openai/codex/releases/download/${codex_release_tag}/install.sh"

if ! printf '%s  %s\n' "${codex_installer_sha256}" "${codex_installer}" |
  sha256sum --check --status; then
  log "Codex ${codex_version} installer checksum validation failed"
  exit 1
fi

case "${CODEX_MANAGED_DIRECTORY_MODE}" in
  0700 | 0755) ;;
  *)
    log 'Unsupported Codex managed-directory mode'
    exit 1
    ;;
esac
install -d -m "${CODEX_MANAGED_DIRECTORY_MODE}" "${CODEX_HOME}" "${CODEX_INSTALL_DIR}"
codex_upstream_path="${PATH}"
if [ -n "${CODEX_INSTALL_LOCK_FD:-}" ]; then
  case "${CODEX_INSTALL_LOCK_FD}" in
    *[!0-9]* | '')
      log 'Invalid inherited Codex install lock descriptor'
      exit 1
      ;;
  esac
  codex_lock_file="${CODEX_HOME}/packages/standalone/install.lock"
  if [ "$(readlink -- "/proc/self/fd/${CODEX_INSTALL_LOCK_FD}" 2>/dev/null)" != "${codex_lock_file}" ] ||
    ! /usr/bin/flock --nonblock "${CODEX_INSTALL_LOCK_FD}"; then
    log 'Inherited Codex install lock is invalid or not held'
    exit 1
  fi
  codex_lock_bin="${codex_temp_dir}/lock-bin"
  install -d -m 0700 "${codex_lock_bin}"
  cat > "${codex_lock_bin}/flock" <<'LOCK_SHIM'
#!/bin/sh
set -eu
if [ "$#" -eq 1 ] && [ "$1" = 9 ] && [ -n "${CODEX_INSTALL_LOCK_FD:-}" ]; then
  exec /usr/bin/flock --nonblock "${CODEX_INSTALL_LOCK_FD}"
fi
exec /usr/bin/flock "$@"
LOCK_SHIM
  chmod 0700 "${codex_lock_bin}/flock"
  codex_upstream_path="${codex_lock_bin}:${codex_upstream_path}"
fi
CODEX_HOME="${CODEX_HOME}" \
  CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR}" \
  CODEX_NON_INTERACTIVE="${CODEX_NON_INTERACTIVE}" \
  CODEX_RELEASE="${codex_version}" \
  PATH="${codex_upstream_path}" \
  sh "${codex_installer}" >&2

jq -cn \
  --arg targetVersion "${codex_version}" \
  '{schemaVersion: 1, targetVersion: $targetVersion}'
