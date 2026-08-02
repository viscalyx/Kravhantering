#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[rolling-git-source] %s\n' "$*" >&2
}

if [ "$#" -ne 3 ]; then
  log 'Usage: install-rolling-git-source.sh REPOSITORY BRANCH DESTINATION'
  exit 64
fi

repository="$1"
branch="$2"
destination="$3"

case "${repository}" in
  https://github.com/*.git) ;;
  file://*)
    if [ "${ROLLING_GIT_ALLOW_FILE_URL:-0}" != '1' ]; then
      log 'file:// repositories are allowed only by the test harness'
      exit 64
    fi
    ;;
  *)
    log "Unsupported rolling Git repository: ${repository}"
    exit 64
    ;;
esac

if [ -e "${destination}" ]; then
  if [ ! -d "${destination}/.git" ]; then
    log "Destination exists but is not a Git checkout: ${destination}"
    exit 1
  fi
  log "Keeping existing installation at ${destination}"
  exit 0
fi

resolved_commit="$(
  git ls-remote --exit-code "${repository}" "refs/heads/${branch}" |
    awk 'NR == 1 { print $1 }'
)"
if ! [[ "${resolved_commit}" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]]; then
  log "Could not resolve ${repository} branch ${branch} to one commit"
  exit 1
fi

destination_parent="$(dirname "${destination}")"
install -d -m 0755 "${destination_parent}"
checkout_temp_dir="$(mktemp -d "${destination_parent}/.krav-git-source.XXXXXX")"
cleanup() {
  if [ -d "${checkout_temp_dir}" ]; then
    rm -rf "${checkout_temp_dir}"
  fi
}
trap cleanup EXIT

git -C "${checkout_temp_dir}" init --quiet
git -C "${checkout_temp_dir}" remote add origin "${repository}"
git -C "${checkout_temp_dir}" fetch --quiet --depth=1 origin "${resolved_commit}"
git -C "${checkout_temp_dir}" checkout --quiet --detach "${resolved_commit}"
actual_commit="$(git -C "${checkout_temp_dir}" rev-parse HEAD)"
if [ "${actual_commit}" != "${resolved_commit}" ]; then
  log "Resolved Git object changed before checkout"
  exit 1
fi

mv "${checkout_temp_dir}" "${destination}"
trap - EXIT
log "Installed ${repository} branch ${branch} at ${resolved_commit}"
