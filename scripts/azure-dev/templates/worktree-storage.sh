#!/usr/bin/env bash
set -euo pipefail

DATA_MOUNT_DIR="${KRAV_AZURE_DATA_MOUNT:-/mnt/krav-azure-dev-data}"
DATA_WORKSPACE_DIR="${KRAV_AZURE_DATA_WORKSPACE:-${DATA_MOUNT_DIR}/workspace}"
WORKTREE_ROOT="${KRAV_AZURE_WORKTREE_ROOT:-${DATA_MOUNT_DIR}/.worktrees}"
LEGACY_WORKTREE_PATH="${KRAV_AZURE_LEGACY_WORKTREE_PATH:-/workspace/.worktrees}"
WORKTREE_OWNER="${KRAV_AZURE_WORKTREE_OWNER:-vscode}"
WORKTREE_GROUP="${KRAV_AZURE_WORKTREE_GROUP:-vscode}"

usage() {
  printf 'Usage: worktree-storage <prepare|validate>\n'
}

path_exists() {
  [ -e "$1" ] || [ -L "$1" ]
}

find_legacy_worktree_storage() {
  local path

  for path in \
    "${LEGACY_WORKTREE_PATH}" \
    "${DATA_WORKSPACE_DIR}/.worktrees"; do
    if path_exists "${path}"; then
      printf '%s\n' "${path}"
      return 0
    fi
  done
  return 1
}

reject_legacy_worktree_storage() {
  local legacy_path

  if legacy_path="$(find_legacy_worktree_storage)"; then
    printf '%s\n' \
      "Unsupported Azure worktree storage found at ${legacy_path}." \
      'Rebuild this temporary Azure development environment; setup will not move, delete, or link existing worktrees.' \
      >&2
    return 1
  fi
}

prepare_worktree_root() {
  reject_legacy_worktree_storage

  if [ -L "${WORKTREE_ROOT}" ] || {
    [ -e "${WORKTREE_ROOT}" ] && [ ! -d "${WORKTREE_ROOT}" ]
  }; then
    printf 'Azure worktree root must be a real directory: %s\n' \
      "${WORKTREE_ROOT}" >&2
    return 1
  fi

  install -d \
    -o "${WORKTREE_OWNER}" \
    -g "${WORKTREE_GROUP}" \
    -m 0750 \
    "${WORKTREE_ROOT}"
}

validate_worktree_root() {
  local data_device_number legacy_path owner write_probe

  if [ ! -d "${WORKTREE_ROOT}" ] || [ -L "${WORKTREE_ROOT}" ]; then
    printf 'Azure worktree root is not a real directory: %s\n' \
      "${WORKTREE_ROOT}" >&2
    return 1
  fi
  if legacy_path="$(find_legacy_worktree_storage)"; then
    printf 'Legacy Azure worktree path %s must be absent.\n' \
      "${legacy_path}" >&2
    return 1
  fi

  owner="$(stat -c '%U' "${WORKTREE_ROOT}")"
  if [ "${owner}" != "${WORKTREE_OWNER}" ]; then
    printf 'Azure worktree root owner is %s; expected %s.\n' \
      "${owner}" "${WORKTREE_OWNER}" >&2
    return 1
  fi

  if ! write_probe="$(mktemp "${WORKTREE_ROOT}/.krav-write-probe.XXXXXX")"; then
    printf 'Azure worktree root is not writable: %s\n' \
      "${WORKTREE_ROOT}" >&2
    return 1
  fi
  rm -f "${write_probe}"

  data_device_number="$(stat -c '%d' "${DATA_MOUNT_DIR}")"
  if [ "$(stat -c '%d' "${WORKTREE_ROOT}")" != "${data_device_number}" ]; then
    printf 'Azure worktree root is not on the managed data disk: %s\n' \
      "${WORKTREE_ROOT}" >&2
    return 1
  fi
}

case "${1:-}" in
  prepare)
    prepare_worktree_root
    ;;
  validate)
    validate_worktree_root
    ;;
  -h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
