#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: sync_ai_instructions.sh [repo-root]

Convert files from .github/instructions/ into Claude Code rules in
.claude/rules/, turning the Copilot applyTo frontmatter field into a Claude
Code paths list.
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
target_dir="$repo_root/.claude/rules"

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

# Print a Copilot instruction file as a Claude Code rule: inside the leading
# frontmatter block, `applyTo: <globs>` becomes a `paths` list with one glob
# per item. Claude Code does not match brace groups nested inside another
# brace group, so an outer `{a,b/*.{ts,tsx}}` group is unwrapped and split on
# its top-level commas, as are Copilot's comma-separated globs.
to_claude_rule() {
  awk -v sq="'" '
    function yaml_quote(text) {
      gsub(sq, sq sq, text)
      return sq text sq
    }
    NR == 1 && $0 == "---" { in_frontmatter = 1; print; next }
    in_frontmatter && $0 == "---" { in_frontmatter = 0; print; next }
    in_frontmatter && /^applyTo:/ {
      value = $0
      sub(/^applyTo:[[:space:]]*/, "", value)
      sub(/[[:space:]]+$/, "", value)
      first = substr(value, 1, 1)
      if ((first == "\"" || first == sq) && length(value) > 1 &&
        substr(value, length(value), 1) == first) {
        value = substr(value, 2, length(value) - 2)
        if (first == sq) {
          gsub(sq sq, sq, value)
        }
      }

      depth = 0
      outer_close = 0
      for (i = 1; i <= length(value); i++) {
        char = substr(value, i, 1)
        if (char == "{") {
          depth++
        } else if (char == "}" && --depth == 0) {
          outer_close = i
          break
        }
      }
      if (substr(value, 1, 1) == "{" && outer_close == length(value)) {
        value = substr(value, 2, length(value) - 2)
      }

      print "paths:"
      depth = 0
      glob = ""
      for (i = 1; i <= length(value); i++) {
        char = substr(value, i, 1)
        if (char == "," && depth == 0) {
          print "  - " yaml_quote(glob)
          glob = ""
          continue
        }
        if (char == "{") {
          depth++
        } else if (char == "}") {
          depth--
        }
        glob = glob char
      }
      print "  - " yaml_quote(glob)
      next
    }
    { print }
  ' "$1"
}

verify_claude_rules() {
  local verified_files=0
  local source_file

  for source_file in "${instruction_files[@]}"; do
    local target_file

    target_file="$target_dir/$(basename "$source_file")"

    if [[ ! -f "$target_file" ]]; then
      printf 'Verification failed: missing Claude Code rule: %s\n' \
        "$target_file" >&2
      exit 1
    fi

    if ! to_claude_rule "$source_file" | cmp -s - "$target_file"; then
      printf 'Verification failed: Claude Code rule differs from source: %s\n' \
        "$target_file" >&2
      exit 1
    fi

    verified_files=$((verified_files + 1))
  done

  printf 'Verified .claude/rules: %d rule(s) match converted source\n' \
    "$verified_files"
}

mkdir -p "$target_dir"

for source_file in "${instruction_files[@]}"; do
  file_name="$(basename "$source_file")"
  to_claude_rule "$source_file" >"$target_dir/$file_name"
  printf 'Converted %s\n' ".claude/rules/$file_name"
done

verify_claude_rules

printf 'Synced %d instruction file(s) to %s\n' \
  "${#instruction_files[@]}" "$target_dir"
