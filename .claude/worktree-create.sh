#!/usr/bin/env bash
# Claude Code WorktreeCreate hook. Creates every Claude Code worktree (subagent
# isolation, --worktree, background sessions) outside the repository checkout,
# branched from the invoking checkout's current HEAD. Prints only the path.
set -euo pipefail

input="$(cat)"
source_dir="$(jq -r '.cwd // empty' <<<"${input}")"
name="$(jq -r '.name // empty' <<<"${input}")"

if [[ -z "${source_dir}" || -z "${name}" ]]; then
  printf 'WorktreeCreate input needs cwd and name\n' >&2
  exit 1
fi

if [[ -n "${KRAV_WORKTREE_ROOT:-}" ]]; then
  worktree_root="${KRAV_WORKTREE_ROOT}"
elif [[ -d /mnt/krav-azure-dev-data/.worktrees ]]; then
  worktree_root=/mnt/krav-azure-dev-data/.worktrees
else
  worktree_root="${TMPDIR:-/tmp}/kravhantering-worktrees"
fi

worktree="${worktree_root}/${name}"

if [[ -e "${worktree}" ]]; then
  git -C "${worktree}" rev-parse --is-inside-work-tree >/dev/null
else
  git -C "${source_dir}" worktree add -q -b "wt/${name}" "${worktree}" HEAD >&2
fi

printf '%s\n' "${worktree}"
