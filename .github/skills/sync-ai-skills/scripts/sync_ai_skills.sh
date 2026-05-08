#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: sync_ai_skills.sh [repo-root]

Copy skill folders from .github/skills/ into:
- ${CODEX_HOME:-$HOME/.codex}/skills when Codex home exists
- .agent/skills inside the repository for Google Antigravity
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 1 ]]; then
  usage >&2
  exit 2
fi

repo_root="${1:-.}"
repo_root="$(cd "$repo_root" && pwd -P)"
source_dir="$repo_root/.github/skills"
codex_root="${CODEX_HOME:-$HOME/.codex}"
antigravity_target="$repo_root/.agent/skills"

if [[ ! -d "$source_dir" ]]; then
  printf 'Source skills directory not found: %s\n' "$source_dir" >&2
  exit 1
fi

skill_dirs=()
while IFS= read -r skill_dir; do
  skill_dirs+=("$skill_dir")
done < <(find "$source_dir" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

if [[ "${#skill_dirs[@]}" -eq 0 ]]; then
  printf 'No skill directories found in: %s\n' "$source_dir" >&2
  exit 1
fi

hash_file() {
  local file_path="$1"
  local hash_output

  if command -v sha256sum >/dev/null 2>&1; then
    hash_output="$(sha256sum "$file_path")"
    printf '%s\n' "${hash_output%% *}"
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    hash_output="$(shasum -a 256 "$file_path")"
    printf '%s\n' "${hash_output%% *}"
    return
  fi

  printf 'Neither sha256sum nor shasum is available for verification.\n' >&2
  exit 1
}

verify_skill_copy() {
  local source_skill_dir="$1"
  local target_skill_dir="$2"
  local target_label="$3"
  local skill_name
  local verified_files=0

  skill_name="$(basename "$source_skill_dir")"

  if [[ ! -d "$target_skill_dir" ]]; then
    printf 'Verification failed: missing destination skill directory: %s\n' \
      "$target_skill_dir" >&2
    exit 1
  fi

  while IFS= read -r source_file; do
    local relative_path
    local target_file
    local source_hash
    local target_hash

    relative_path="${source_file#"$source_skill_dir"/}"
    target_file="$target_skill_dir/$relative_path"

    if [[ ! -f "$target_file" ]]; then
      printf 'Verification failed: missing copied file: %s\n' \
        "$target_file" >&2
      exit 1
    fi

    source_hash="$(hash_file "$source_file")"
    target_hash="$(hash_file "$target_file")"

    if [[ "$source_hash" != "$target_hash" ]]; then
      printf 'Verification failed: hash mismatch for %s in %s\n' \
        "$relative_path" "$target_label" >&2
      printf 'Source:      %s\nDestination: %s\n' \
        "$source_hash" "$target_hash" >&2
      exit 1
    fi

    verified_files=$((verified_files + 1))
  done < <(find "$source_skill_dir" -type f | LC_ALL=C sort)

  printf 'Verified %s/%s: %d source file hash(es) match destination\n' \
    "$target_label" "$skill_name" "$verified_files"
}

copy_skills_to_target() {
  local target_dir="$1"
  local target_label="$2"

  mkdir -p "$target_dir"
  printf 'Syncing %d skill(s) to %s: %s\n' \
    "${#skill_dirs[@]}" "$target_label" "$target_dir"

  local skill_dir
  local skill_name
  for skill_dir in "${skill_dirs[@]}"; do
    skill_name="$(basename "$skill_dir")"
    cp -R "$skill_dir" "$target_dir/"
    printf 'Copied %s -> %s/%s\n' "$skill_name" "$target_label" "$skill_name"
    verify_skill_copy "$skill_dir" "$target_dir/$skill_name" "$target_label"
  done
}

if [[ -d "$codex_root" ]]; then
  copy_skills_to_target "$codex_root/skills" "Codex skills"
else
  printf 'Skipping Codex skills: Codex home does not exist: %s\n' "$codex_root"
fi

copy_skills_to_target "$antigravity_target" "Google Antigravity skills"

printf 'Synced %d skill(s) from %s\n' "${#skill_dirs[@]}" "$source_dir"
