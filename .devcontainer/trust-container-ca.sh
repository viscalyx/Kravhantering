#!/usr/bin/env bash
set -euo pipefail

CA_PATH="${1:-tmp/container-tls/ca.crt}"
NSS_DIR="${HOME}/.pki/nssdb"
NSS_NAME="kravhantering-test-ca"
SYSTEM_CA_PATH="/usr/local/share/ca-certificates/kravhantering-test-ca.crt"

mkdir -p "${NSS_DIR}"

if command -v certutil >/dev/null 2>&1; then
  if [ ! -f "${NSS_DIR}/cert9.db" ]; then
    certutil -N --empty-password -d "sql:${NSS_DIR}"
  fi
else
  echo "certutil is not installed; skipping Chromium NSS trust setup." >&2
fi

if [ ! -f "${CA_PATH}" ]; then
  echo "No container CA found at ${CA_PATH}; skipping CA import."
  exit 0
fi

if command -v sudo >/dev/null 2>&1 &&
  command -v update-ca-certificates >/dev/null 2>&1 &&
  [ -d /usr/local/share/ca-certificates ] &&
  sudo -n true >/dev/null 2>&1; then
  sudo cp "${CA_PATH}" "${SYSTEM_CA_PATH}"
  sudo update-ca-certificates >/dev/null
else
  echo "System CA tooling is unavailable; skipping system CA trust setup." >&2
fi

if command -v certutil >/dev/null 2>&1; then
  certutil -D -d "sql:${NSS_DIR}" -n "${NSS_NAME}" >/dev/null 2>&1 || true
  certutil -A -d "sql:${NSS_DIR}" -n "${NSS_NAME}" -t "C,," -i "${CA_PATH}"
fi

echo "Trusted ${CA_PATH} for the local release-smoke runner."
