#!/usr/bin/env bash
set -euo pipefail

CODEX_INSTALLER="${AZURE_DEV_CODEX_INSTALLER:-/usr/local/share/kravhantering/install-codex.sh}"

log() {
  printf '[azure-codex-orchestration] %s\n' "$*" >&2
}

if [ ! -f "${CODEX_INSTALLER}" ]; then
  log "Shared Codex installer is missing: ${CODEX_INSTALLER}"
  exit 1
fi

if ! installer_result="$(bash "${CODEX_INSTALLER}")"; then
  exit 1
fi

if [ "$(printf '%s\n' "${installer_result}" | wc -l)" -ne 1 ] ||
  ! target_version="$(
    printf '%s\n' "${installer_result}" |
      jq -er '
        if type == "object" and
          keys == ["schemaVersion", "targetVersion"] and
          .schemaVersion == 1 and
          (.targetVersion | type == "string") and
          (.targetVersion | test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))
        then .targetVersion
        else error("invalid Codex installer result")
        end
      '
  )"; then
  log 'Codex installer result is invalid'
  exit 1
fi

canonical_result="$(
  jq -cn \
    --arg targetVersion "${target_version}" \
    '{schemaVersion: 1, targetVersion: $targetVersion}'
)"
if [ "${installer_result}" != "${canonical_result}" ]; then
  log 'Codex installer result is invalid'
  exit 1
fi
printf 'KRAV_AZURE_CODEX_RESULT=%s\n' "${canonical_result}"
