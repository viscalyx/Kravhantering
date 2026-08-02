#!/usr/bin/env bash
set -euo pipefail

DOTENV_LINTER_INSTALL_DIR="${DOTENV_LINTER_INSTALL_DIR:-/usr/local/bin}"
DOTENV_LINTER_RELEASE_API_URL="${DOTENV_LINTER_RELEASE_API_URL:-https://api.github.com/repos/dotenv-linter/dotenv-linter/releases/latest}"
DOTENV_LINTER_RELEASE_DOWNLOAD_URL="${DOTENV_LINTER_RELEASE_DOWNLOAD_URL:-https://github.com/dotenv-linter/dotenv-linter/releases/download}"

log() {
  printf '[dotenv-linter-installer] %s\n' "$*" >&2
}

case "$(uname -m)" in
  x86_64 | amd64) dotenv_linter_arch='x86_64' ;;
  aarch64 | arm64) dotenv_linter_arch='aarch64' ;;
  *)
    log "Unsupported architecture: $(uname -m)"
    exit 1
    ;;
esac

dotenv_linter_temp_dir="$(mktemp -d /tmp/krav-dotenv-linter.XXXXXX)"
cleanup() {
  rm -rf "${dotenv_linter_temp_dir}"
}
trap cleanup EXIT

release_json="${dotenv_linter_temp_dir}/release.json"
asset_name="dotenv-linter-linux-${dotenv_linter_arch}.tar.gz"
archive_path="${dotenv_linter_temp_dir}/${asset_name}"

curl -fsSLo "${release_json}" "${DOTENV_LINTER_RELEASE_API_URL}"
if ! release_tag="$(
  jq -er '.tag_name | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))' \
    "${release_json}"
)" ||
  ! asset_sha256="$(
    jq -er \
      --arg asset_name "${asset_name}" \
      '[.assets[] | select(.name == $asset_name) | .digest |
        select(startswith("sha256:"))] |
        if length == 1 then .[0] | sub("^sha256:"; "")
        else error("missing unique asset SHA-256 digest") end' \
      "${release_json}"
  )"; then
  log "Could not resolve the latest ${asset_name} release asset and digest"
  exit 1
fi

curl -fsSLo "${archive_path}" \
  "${DOTENV_LINTER_RELEASE_DOWNLOAD_URL}/${release_tag}/${asset_name}"
if ! printf '%s  %s\n' "${asset_sha256}" "${archive_path}" |
  sha256sum --check --status; then
  log "dotenv-linter ${release_tag} archive checksum validation failed"
  exit 1
fi

tar -xzf "${archive_path}" -C "${dotenv_linter_temp_dir}"
if [ ! -f "${dotenv_linter_temp_dir}/dotenv-linter" ]; then
  log "Verified archive does not contain dotenv-linter"
  exit 1
fi
install -d -m 0755 "${DOTENV_LINTER_INSTALL_DIR}"
install -m 0755 \
  "${dotenv_linter_temp_dir}/dotenv-linter" \
  "${DOTENV_LINTER_INSTALL_DIR}/dotenv-linter"
"${DOTENV_LINTER_INSTALL_DIR}/dotenv-linter" --version
