#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[apt-key-verifier] %s\n' "$*" >&2
}

if [ "$#" -lt 4 ]; then
  log 'Usage: verify-apt-key.sh NAME URL DESTINATION EXPECTED_FINGERPRINT [...]'
  exit 64
fi

key_name="$1"
key_url="$2"
destination="$3"
shift 3

key_temp_dir="$(mktemp -d /tmp/krav-apt-key.XXXXXX)"
cleanup() {
  rm -rf "${key_temp_dir}"
}
trap cleanup EXIT

downloaded_key="${key_temp_dir}/downloaded.key"
canonical_key="${key_temp_dir}/canonical.gpg"
export GNUPGHOME="${key_temp_dir}/gnupg"
install -d -m 0700 "${GNUPGHOME}"
curl -fsSLo "${downloaded_key}" "${key_url}"

actual_fingerprints="$(
  gpg --batch --show-keys --with-colons "${downloaded_key}" |
    awk -F: '
      $1 == "pub" { want_primary = 1; next }
      want_primary && $1 == "fpr" {
        print toupper($10)
        want_primary = 0
      }
    ' |
    sort -u
)"
expected_fingerprints="$(printf '%s\n' "$@" | tr '[:lower:]' '[:upper:]' | sort -u)"

if [ -z "${actual_fingerprints}" ] ||
  [ "${actual_fingerprints}" != "${expected_fingerprints}" ]; then
  log "${key_name} signing-key fingerprint validation failed"
  log "Expected: ${expected_fingerprints//$'\n'/, }"
  log "Actual: ${actual_fingerprints//$'\n'/, }"
  exit 1
fi

gpg --batch --yes --dearmor --output "${canonical_key}" "${downloaded_key}"
install -D -m 0644 "${canonical_key}" "${destination}"
log "Verified ${key_name} signing key: ${actual_fingerprints//$'\n'/, }"
