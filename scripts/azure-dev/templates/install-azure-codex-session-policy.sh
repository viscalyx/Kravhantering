#!/usr/bin/env bash
set -euo pipefail

CODEX_USER="${AZURE_DEV_CODEX_USER:-vscode}"
CODEX_USER_HOME="${AZURE_DEV_CODEX_USER_HOME:-/home/${CODEX_USER}}"
CODEX_BIN="${CODEX_USER_HOME}/.local/bin"
CODEX_LAUNCHER="${CODEX_BIN}/codex"
MANAGED_PATH="${CODEX_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ZSHRC_SOURCE="${AZURE_DEV_ZSHRC_SOURCE:?AZURE_DEV_ZSHRC_SOURCE is required}"
ZSHRC_DESTINATION="${AZURE_DEV_ZSHRC_DESTINATION:-${CODEX_USER_HOME}/.zshrc}"
SSHD_CONFIG="${AZURE_DEV_SSHD_ENVIRONMENT_CONFIG:-/etc/ssh/sshd_config.d/01-kravhantering-environment.conf}"
BASH_PROFILE="${AZURE_DEV_BASH_CODEX_PATH_PROFILE:-/etc/profile.d/krav-azure-codex-path.sh}"
SSHD_BIN="${AZURE_DEV_SSHD_BIN:-/usr/sbin/sshd}"
SYSTEMCTL_BIN="${AZURE_DEV_SYSTEMCTL_BIN:-systemctl}"

log() {
  printf '[azure-codex-session-policy] %s\n' "$*" >&2
}

run_as_codex_user() {
  if [ "$(id -un)" = "${CODEX_USER}" ]; then
    env "$@"
  else
    runuser -u "${CODEX_USER}" -- env "$@"
  fi
}

install -d -m 0755 "$(dirname -- "${SSHD_CONFIG}")" "$(dirname -- "${BASH_PROFILE}")"
cat > "${SSHD_CONFIG}" <<EOF
# Managed by Kravhantering Azure development setup.
AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN
Match User ${CODEX_USER}
    SetEnv PATH=${MANAGED_PATH}
Match all
EOF
chmod 0644 "${SSHD_CONFIG}"

cat > "${BASH_PROFILE}" <<EOF
# Managed by Kravhantering Azure development setup.
if [ "\$(id -un)" = "${CODEX_USER}" ]; then
  export PATH="${MANAGED_PATH}"
fi
EOF
chmod 0644 "${BASH_PROFILE}"

if [ ! -f "${ZSHRC_SOURCE}" ]; then
  log "Zsh template not found: ${ZSHRC_SOURCE}"
  exit 1
fi
policy_temp_dir="$(mktemp -d)"
zshrc_candidate="${policy_temp_dir}/.zshrc"
trap 'rm -rf -- "${policy_temp_dir}"' EXIT
cat "${ZSHRC_SOURCE}" > "${zshrc_candidate}"
cat >> "${zshrc_candidate}" <<EOF

# BEGIN managed Azure Codex command path
export PATH="${MANAGED_PATH}"
# END managed Azure Codex command path
EOF
chown -R "${CODEX_USER}:${CODEX_USER}" "${policy_temp_dir}"
chmod 0700 "${policy_temp_dir}"
chmod 0644 "${zshrc_candidate}"

"${SSHD_BIN}" -t
"${SYSTEMCTL_BIN}" reload ssh.service

effective_ssh_path() {
  "${SSHD_BIN}" -T \
    -C "user=$1,host=localhost,addr=127.0.0.1" |
    awk '$1 == "setenv" { for (i = 2; i <= NF; i++) if ($i ~ /^PATH=/) { sub(/^PATH=/, "", $i); print $i } }'
}

if [ "$(effective_ssh_path "${CODEX_USER}")" != "${MANAGED_PATH}" ]; then
  log "effective SSH command path for ${CODEX_USER} is not the managed path"
  exit 1
fi
for account in root nobody; do
  if [[ ":$(effective_ssh_path "${account}"):" == *":${CODEX_BIN}:"* ]]; then
    log "effective SSH command path for ${account} exposes the user-managed directory"
    exit 1
  fi
done

if ! run_as_codex_user \
  HOME="${CODEX_USER_HOME}" \
  ZDOTDIR="${policy_temp_dir}" \
  EXPECTED_CODEX_LAUNCHER="${CODEX_LAUNCHER}" \
  MANAGED_BASH_PROFILE="${BASH_PROFILE}" \
  bash --noprofile --norc -c '
    . "${MANAGED_BASH_PROFILE}"
    test "$(type -t codex)" = file &&
      test "$(command -v codex)" = "${EXPECTED_CODEX_LAUNCHER}"
  '; then
  log 'Bash login defines an alias or function named codex, or masks the managed launcher'
  exit 1
fi
if ! run_as_codex_user \
  HOME="${CODEX_USER_HOME}" \
  ZDOTDIR="${policy_temp_dir}" \
  EXPECTED_CODEX_LAUNCHER="${CODEX_LAUNCHER}" \
  zsh -ic '
    (( ! $+aliases[codex] && ! $+functions[codex] )) &&
      test "$(whence -p codex)" = "${EXPECTED_CODEX_LAUNCHER}"
  '; then
  log 'Zsh profile defines an alias or function named codex, or masks the managed launcher'
  exit 1
fi

install -o "${CODEX_USER}" -g "${CODEX_USER}" -m 0644 \
  "${zshrc_candidate}" "${ZSHRC_DESTINATION}"

log 'vscode-only SSH, Bash, and Zsh Codex command paths configured and validated'
