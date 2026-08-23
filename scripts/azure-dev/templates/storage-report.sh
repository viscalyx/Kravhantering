#!/usr/bin/env bash
set -euo pipefail

DATA_MOUNT_DIR="${KRAV_STORAGE_DATA_MOUNT:-/mnt/krav-azure-dev-data}"
WORKSPACE_DIR="${KRAV_STORAGE_WORKSPACE:-/workspace}"
WORKTREE_ROOT="${KRAV_AZURE_WORKTREE_ROOT:-${DATA_MOUNT_DIR}/.worktrees}"
WARNING_USED_PERCENT="${KRAV_STORAGE_WARNING_USED_PERCENT:-80}"
URGENT_USED_PERCENT="${KRAV_STORAGE_URGENT_USED_PERCENT:-90}"

usage() {
  printf 'Usage: storage-report [--check]\n'
  printf '  --check  Print only filesystem warnings.\n'
}

filesystem_warning() {
  local label="$1"
  local path="$2"
  local usage_percent available

  if [ ! -e "${path}" ]; then
    printf 'Storage warning: %s is unavailable at %s.\n' "${label}" "${path}"
    return 0
  fi

  usage_percent="$(df -P "${path}" | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
  if [ -z "${usage_percent}" ] || [ "${usage_percent}" -lt "${WARNING_USED_PERCENT}" ]; then
    return 1
  fi

  available="$(df -hP "${path}" | awk 'NR == 2 { print $4 }')"
  if [ "${usage_percent}" -ge "${URGENT_USED_PERCENT}" ]; then
    printf 'Urgent storage warning: %s is %s%% used with %s available.\n' \
      "${label}" "${usage_percent}" "${available}"
  else
    printf 'Storage warning: %s is %s%% used with %s available.\n' \
      "${label}" "${usage_percent}" "${available}"
  fi
  return 0
}

check_filesystems() {
  local warned=0
  if filesystem_warning 'root filesystem' /; then
    warned=1
  fi

  if filesystem_warning 'Azure data disk' "${DATA_MOUNT_DIR}"; then
    warned=1
  fi

  if [ "${warned}" -eq 1 ]; then
    printf 'Run this command in the terminal for read-only diagnostics and cleanup suggestions:\n'
    printf '  storage-report\n'
  fi
}

directory_sizes() {
  local path
  local paths=(
    /var/lib/containerd
    /var/lib/docker
    /tmp
    /home/vscode/.vscode-server
    /home/vscode/.codex
    /home/vscode/.cache
    /home/vscode/.npm
    "${WORKTREE_ROOT}"
  )

  printf '\nLargest managed or developer-created directories\n'
  for path in "${paths[@]}"; do
    if [ ! -e "${path}" ]; then
      continue
    fi
    if ! du -shx "${path}" 2>/dev/null; then
      sudo -n du -shx "${path}" 2>/dev/null || true
    fi
  done | sort -hr
}

container_usage() {
  if command -v docker >/dev/null 2>&1; then
    printf '\nDocker usage\n'
    docker system df 2>/dev/null || printf 'Docker usage is unavailable.\n'
  fi
  if command -v podman >/dev/null 2>&1; then
    printf '\nPodman usage\n'
    podman system df 2>/dev/null || printf 'Podman usage is unavailable.\n'
  fi
}

worktree_report() {
  local path='' head='' branch='' line status size removal

  if ! git -C "${WORKSPACE_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
    return
  fi

  printf '\nGit worktrees\n'
  while IFS= read -r line || [ -n "${line}" ]; do
    case "${line}" in
      'worktree '*)
        path="${line#worktree }"
        head=''
        branch=''
        ;;
      'HEAD '*)
        head="${line#HEAD }"
        ;;
      'branch '*)
        branch="${line#branch }"
        ;;
      '')
        if [ -z "${path}" ]; then
          continue
        fi
        size="$(du -sh "${path}" 2>/dev/null | awk '{ print $1 }')"
        size="${size:-unknown size}"
        if [ "${path}" = "${WORKSPACE_DIR}" ]; then
          printf '%s (%s): primary worktree, keep\n' "${path}" "${size}"
        elif [ ! -d "${path}" ]; then
          printf '%s: missing; review with git worktree prune --dry-run\n' "${path}"
        elif [ -n "$(git -C "${path}" status --porcelain 2>/dev/null)" ]; then
          printf '%s (%s): review; contains uncommitted changes\n' "${path}" "${size}"
        elif [ -n "${branch}" ]; then
          printf '%s (%s): clean; commits remain on %s\n' \
            "${path}" "${size}" "${branch#refs/heads/}"
          printf -v removal 'git -C %q worktree remove %q' "${WORKSPACE_DIR}" "${path}"
          printf '  Candidate command: %s\n' "${removal}"
        elif [ -n "${head}" ] && \
          git -C "${WORKSPACE_DIR}" branch --remotes --contains "${head}" \
            | grep -q '[^[:space:]]'; then
          printf '%s (%s): clean detached worktree; commit exists on a remote branch\n' \
            "${path}" "${size}"
          printf -v removal 'git -C %q worktree remove %q' "${WORKSPACE_DIR}" "${path}"
          printf '  Candidate command: %s\n' "${removal}"
        else
          printf '%s (%s): review; detached commit is not verified on a remote branch\n' \
            "${path}" "${size}"
        fi
        path=''
        ;;
    esac
  done < <(git -C "${WORKSPACE_DIR}" worktree list --porcelain; printf '\n')
}

cleanup_suggestions() {
  printf '\nCleanup suggestions (never run automatically)\n'
  printf '%s\n' \
    '- Remove only worktrees classified as clean above.' \
    '- Review docker system df before running docker image prune or docker builder prune.' \
    '- Review podman system df before running podman image prune.' \
    '- Reprovision the temporary environment if several tool caches are disposable.' \
    '- Do not prune container volumes; they may contain the active development database.'
}

case "${1:-}" in
  '')
    ;;
  --check)
    check_filesystems
    exit 0
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

printf 'Filesystem usage\n'
df -hP / "${DATA_MOUNT_DIR}" | awk 'NR == 1 || !seen[$1]++'
directory_sizes
container_usage
worktree_report
cleanup_suggestions
