#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: sync_ai_instructions.sh [repo-root]

Copy files from .github/instructions/ into .agents/rules/.
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
source_dir="$repo_root/.github/instructions"
target_dir="$repo_root/.agents/rules"

if [[ ! -d "$source_dir" ]]; then
  printf 'Source instructions directory not found: %s\n' "$source_dir" >&2
  exit 1
fi

instruction_files=()
while IFS= read -r source_file; do
  instruction_files+=("$source_file")
done < <(find "$source_dir" -maxdepth 1 -type f | LC_ALL=C sort)

if [[ "${#instruction_files[@]}" -eq 0 ]]; then
  printf 'No instruction files found in: %s\n' "$source_dir" >&2
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

verify_instruction_copy() {
  local verified_files=0
  local source_file

  for source_file in "${instruction_files[@]}"; do
    local file_name
    local target_file
    local source_hash
    local target_hash

    file_name="$(basename "$source_file")"
    target_file="$target_dir/$file_name"

    if [[ ! -f "$target_file" ]]; then
      printf 'Verification failed: missing copied file: %s\n' \
        "$target_file" >&2
      exit 1
    fi

    source_hash="$(hash_file "$source_file")"
    target_hash="$(hash_file "$target_file")"

    if [[ "$source_hash" != "$target_hash" ]]; then
      printf 'Verification failed: hash mismatch for %s\n' \
        ".agents/rules/$file_name" >&2
      printf 'Source:      %s\nDestination: %s\n' \
        "$source_hash" "$target_hash" >&2
      exit 1
    fi

    verified_files=$((verified_files + 1))
  done

  printf 'Verified .agents/rules: %d source file hash(es) match destination\n' \
    "$verified_files"
}

mkdir -p "$target_dir"

copied=0
for source_file in "${instruction_files[@]}"; do
  file_name="$(basename "$source_file")"
  cp -p "$source_file" "$target_dir/$file_name"
  printf 'Copied %s\n' ".agents/rules/$file_name"
  copied=$((copied + 1))
done

verify_instruction_copy

printf 'Synced %d instruction file(s) to %s\n' "$copied" "$target_dir"
