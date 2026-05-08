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

mkdir -p "$target_dir"

copied=0
for source_file in "${instruction_files[@]}"; do
  file_name="$(basename "$source_file")"
  cp -p "$source_file" "$target_dir/$file_name"
  printf 'Copied %s\n' ".agents/rules/$file_name"
  copied=$((copied + 1))
done

printf 'Synced %d instruction file(s) to %s\n' "$copied" "$target_dir"
