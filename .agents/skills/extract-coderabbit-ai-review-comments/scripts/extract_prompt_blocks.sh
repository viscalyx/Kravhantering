#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input-file|-> <output-file>" >&2
  exit 1
fi

input_file="$1"
output_file="$2"

cleanup_temp_files() {
  local input="${temp_input_file:-}"
  if [[ -n "$input" && -f "$input" ]]; then
    rm -f "$input"
  fi
  local output="${temp_output_file:-}"
  if [[ -n "$output" && -f "$output" ]]; then
    rm -f "$output"
  fi
}
trap cleanup_temp_files EXIT ERR

if [[ "$input_file" == "-" ]]; then
  temp_input_file="$(mktemp)"
  cat > "$temp_input_file"
  input_file="$temp_input_file"
fi

if [[ ! -f "$input_file" ]]; then
  echo "Input file not found: $input_file" >&2
  exit 1
fi

# Guard: if input and output resolve to the same file, route through a temp file
# to prevent the shell redirect from truncating before AWK reads.
resolved_input="$(realpath -- "$input_file" 2>/dev/null || echo "$input_file")"
resolved_output="$(realpath -- "$output_file" 2>/dev/null || echo "$output_file")"
use_temp_output=false
temp_output_file=""
if [[ "$resolved_input" -ef "$resolved_output" ]]; then
  temp_output_file="$(mktemp)"
  use_temp_output=true
fi

awk '
function dequote(s) {
  sub(/^> ?/, "", s)
  return s
}

BEGIN {
  waiting = 0
  in_code = 0
  count = 0
  seen_nonblank_in_block = 0
  pending_blank_lines = 0
  drop_next_blank = 0
  block_is_quoted = 0
  leadin = "Verify each finding against the current code and only fix it if needed."
}

{
  line = $0

  if (!in_code) {
    norm = dequote(line)
    if (norm ~ /^<summary>🤖 Prompt for AI Agents<\/summary>$/) {
      waiting = 1
      next
    }

    if (waiting && norm ~ /^```/) {
      in_code = 1
      block_is_quoted = (line != norm)
      seen_nonblank_in_block = 0
      pending_blank_lines = 0
      drop_next_blank = 0
      if (count > 0) {
        print ""
      }
      count++
      next
    }

    next
  }

  # Inside a code block: dequote only if the block started quoted
  if (block_is_quoted) {
    out = dequote(line)
  } else {
    out = line
  }

  if (out ~ /^```/) {
    in_code = 0
    waiting = 0
    block_is_quoted = 0
    seen_nonblank_in_block = 0
    pending_blank_lines = 0
    drop_next_blank = 0
    next
  }

  if (!seen_nonblank_in_block && out == leadin) {
    drop_next_blank = 1
    next
  }

  if (drop_next_blank && out == "") {
    drop_next_blank = 0
    next
  }

  if (out == "") {
    if (!seen_nonblank_in_block) {
      next
    }
    pending_blank_lines++
    next
  }

  seen_nonblank_in_block = 1
  drop_next_blank = 0
  while (pending_blank_lines > 0) {
    print ""
    pending_blank_lines--
  }
  print out
}
' "$input_file" > "${temp_output_file:-$output_file}"

# If we used a temp file to avoid same-file truncation, move it into place now.
if [[ "$use_temp_output" == "true" ]]; then
  mv -- "$temp_output_file" "$output_file"
fi
