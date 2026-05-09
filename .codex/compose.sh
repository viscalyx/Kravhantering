#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
worktree_path="${CODEX_WORKTREE_PATH:-${repo_root}}"

if [ "${KRAV_DEVCONTAINER:-}" = "1" ] && [ "${CODEX_APP_COMPOSE:-}" != "1" ]; then
  printf '%s\n' \
    ".codex/compose.sh is reserved for Codex App worktree automation." \
    "Inside the VS Code devcontainer, run npm and project commands directly." >&2
  exit 64
fi

if command -v sha256sum >/dev/null 2>&1; then
  worktree_hash="$(printf '%s' "${worktree_path}" | sha256sum | cut -c1-12)"
else
  worktree_hash="$(printf '%s' "${worktree_path}" | shasum -a 256 | cut -c1-12)"
fi

export CODEX_WORKTREE_PATH="${worktree_path}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kravhantering-codex-${worktree_hash}}"

exec docker compose -f "${repo_root}/.codex/docker-compose.yml" "$@"
