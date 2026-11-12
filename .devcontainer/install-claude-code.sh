#!/usr/bin/env bash
set -euo pipefail

# Install the latest Claude Code release for the current user with the
# official native installer. It places the binary under ~/.local and verifies
# its SHA-256 checksum against the release manifest before installing.

log() {
  printf '[claude-code-installer] %s\n' "$*" >&2
}

claude_temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/kravhantering-claude-code-installer.XXXXXX")"
cleanup() {
  rm -rf "${claude_temp_dir}"
}
trap cleanup EXIT

claude_installer="${claude_temp_dir}/install.sh"

# Download before running so a failed download cannot pass as an empty script.
curl \
  --fail \
  --silent \
  --show-error \
  --location \
  --connect-timeout 10 \
  --max-time 120 \
  --retry 3 \
  --retry-delay 2 \
  --retry-all-errors \
  --output "${claude_installer}" \
  https://claude.ai/install.sh

bash "${claude_installer}" >&2

if ! "${HOME}/.local/bin/claude" --version >&2; then
  log 'Claude Code was not installed in ~/.local/bin'
  exit 1
fi
