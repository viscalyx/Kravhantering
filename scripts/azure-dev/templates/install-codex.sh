#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-/usr/local/lib/codex}"
CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR:-/usr/local/bin}"
CODEX_NON_INTERACTIVE="${CODEX_NON_INTERACTIVE:-1}"

log() {
  printf '[codex-installer] %s\n' "$*" >&2
}

codex_temp_dir="$(mktemp -d /tmp/krav-codex-installer.XXXXXX)"
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
codex_auth_options=()
if [ -n "${GH_TOKEN:-}" ]; then
  codex_auth_options=(--header "Authorization: Bearer ${GH_TOKEN}")
fi

curl "${codex_curl_options[@]}" "${codex_auth_options[@]}" \
  --output "${codex_release_json}" \
  https://api.github.com/repos/openai/codex/releases/latest

if ! codex_release_tag="$(
  jq -er \
    '.tag_name | select(test("^rust-v[0-9]+\\.[0-9]+\\.[0-9]+$"))' \
    "${codex_release_json}"
)" ||
  ! codex_installer_sha256="$(
    jq -er \
      '[.assets[] | select(.name == "install.sh") | .digest |
        select(startswith("sha256:"))] |
        if length == 1 then .[0] | sub("^sha256:"; "")
        else error("missing unique install.sh SHA-256 digest") end' \
      "${codex_release_json}"
  )"; then
  log 'Could not resolve the latest Codex installer and digest'
  exit 1
fi
codex_version="${codex_release_tag#rust-v}"

curl "${codex_curl_options[@]}" "${codex_auth_options[@]}" \
  --output "${codex_installer}" \
  "https://github.com/openai/codex/releases/download/${codex_release_tag}/install.sh"

if ! printf '%s  %s\n' "${codex_installer_sha256}" "${codex_installer}" |
  sha256sum --check --status; then
  log "Codex ${codex_version} installer checksum validation failed"
  exit 1
fi

install -d -m 0755 "${CODEX_HOME}" "${CODEX_INSTALL_DIR}"
CODEX_HOME="${CODEX_HOME}" \
  CODEX_INSTALL_DIR="${CODEX_INSTALL_DIR}" \
  CODEX_NON_INTERACTIVE="${CODEX_NON_INTERACTIVE}" \
  CODEX_RELEASE="${codex_version}" \
  sh "${codex_installer}"
