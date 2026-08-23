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
ZSH_BIN="${AZURE_DEV_ZSH_BIN:-zsh}"

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

if [ ! -f "${ZSHRC_SOURCE}" ]; then
  log "Zsh template not found: ${ZSHRC_SOURCE}"
  exit 1
fi

policy_temp_dir="$(mktemp -d)"
sshd_candidate="${policy_temp_dir}/sshd-policy.conf"
bash_candidate="${policy_temp_dir}/bash-policy.sh"
zshrc_candidate="${policy_temp_dir}/.zshrc"
policy_destinations=("${SSHD_CONFIG}" "${BASH_PROFILE}" "${ZSHRC_DESTINATION}")
declare -A policy_previous_state=()
absent_policy_sentinel='krav-policy-destination-was-absent'
policy_install_started=0
policy_committed=0

finish() {
  local status=$? destination previous_state previous_uid previous_gid previous_mode

  trap - EXIT
  if [ "${policy_install_started}" -eq 1 ] && [ "${policy_committed}" -eq 0 ]; then
    set +e
    for destination in "${policy_destinations[@]}"; do
      previous_state="${policy_previous_state["${destination}"]}"
      if [ "${previous_state}" != "${absent_policy_sentinel}" ]; then
        read -r previous_uid previous_gid previous_mode < "${previous_state}/metadata"
        rm -f -- "${destination}"
        install \
          -o "${previous_uid}" \
          -g "${previous_gid}" \
          -m "${previous_mode}" \
          "${previous_state}/content" \
          "${destination}"
      else
        rm -f -- "${destination}"
      fi
    done
    "${SSHD_BIN}" -t >/dev/null 2>&1 &&
      "${SYSTEMCTL_BIN}" reload ssh.service >/dev/null 2>&1
    set -e
    log 'session-policy activation failed; previous policy files restored'
  fi
  rm -rf -- "${policy_temp_dir}"
  exit "${status}"
}
trap finish EXIT

cat > "${sshd_candidate}" <<EOF
# Managed by Kravhantering Azure development setup.
AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN
Match User ${CODEX_USER}
    SetEnv PATH=${MANAGED_PATH}
Match all
EOF

cat > "${bash_candidate}" <<EOF
# Managed by Kravhantering Azure development setup.
if [ "\$(id -un)" = "${CODEX_USER}" ]; then
  export PATH="${MANAGED_PATH}"
fi
EOF

cat "${ZSHRC_SOURCE}" > "${zshrc_candidate}"
cat >> "${zshrc_candidate}" <<EOF

# BEGIN managed Azure Codex command path
typeset -gU path PATH
path=("${CODEX_BIN}" "\${path[@]}")
export PATH
# END managed Azure Codex command path
EOF
chmod 0755 "${policy_temp_dir}"
chmod 0644 "${sshd_candidate}" "${bash_candidate}"
chmod 0644 "${zshrc_candidate}"

effective_ssh_path() {
  local account="$1" config_path="${2:-}"
  local sshd_arguments=(-T)

  if [ -n "${config_path}" ]; then
    sshd_arguments+=(-f "${config_path}")
  fi
  "${SSHD_BIN}" "${sshd_arguments[@]}" \
    -C "user=${account},host=localhost,addr=127.0.0.1" |
    awk '$1 == "setenv" { for (i = 2; i <= NF; i++) if ($i ~ /^PATH=/) { sub(/^PATH=/, "", $i); print $i } }'
}

validate_ssh_policy() {
  local config_path="$1" phase="$2" account

  if [ "$(effective_ssh_path "${CODEX_USER}" "${config_path}")" != "${MANAGED_PATH}" ]; then
    log "${phase} SSH command path for ${CODEX_USER} is not the managed path"
    return 1
  fi
  for account in root nobody; do
    if [[ ":$(effective_ssh_path "${account}" "${config_path}"):" == *":${CODEX_BIN}:"* ]]; then
      log "${phase} SSH command path for ${account} exposes the user-managed directory"
      return 1
    fi
  done
}

"${SSHD_BIN}" -t -f "${sshd_candidate}"
validate_ssh_policy "${sshd_candidate}" 'candidate'

if ! run_as_codex_user \
  HOME="${CODEX_USER_HOME}" \
  ZDOTDIR="${policy_temp_dir}" \
  EXPECTED_CODEX_LAUNCHER="${CODEX_LAUNCHER}" \
  MANAGED_BASH_PROFILE="${bash_candidate}" \
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
  EXPECTED_CODEX_LAUNCHER="${CODEX_LAUNCHER}" \
  MANAGED_ZSHRC="${zshrc_candidate}" \
  "${ZSH_BIN}" -dfi -c '
    . "${MANAGED_ZSHRC}" &&
    (( ! $+aliases[codex] && ! $+functions[codex] )) &&
      test "$(whence -p codex)" = "${EXPECTED_CODEX_LAUNCHER}"
  '; then
  log 'Zsh profile defines an alias or function named codex, or masks the managed launcher'
  exit 1
fi

for destination in "${policy_destinations[@]}"; do
  if [ -L "${destination}" ] || { [ -e "${destination}" ] && [ ! -f "${destination}" ]; }; then
    log "session-policy destination must be a regular file or absent: ${destination}"
    exit 1
  fi
  if [ -e "${destination}" ]; then
    backup_path="${policy_temp_dir}/rollback-${#policy_previous_state[@]}"
    install -d -m 0700 "${backup_path}"
    stat -c '%u %g %a' -- "${destination}" > "${backup_path}/metadata"
    chmod 0600 "${backup_path}/metadata"
    install -m 0600 "${destination}" "${backup_path}/content"
    policy_previous_state["${destination}"]="${backup_path}"
  else
    policy_previous_state["${destination}"]="${absent_policy_sentinel}"
  fi
done

install -d -m 0755 "$(dirname -- "${SSHD_CONFIG}")" "$(dirname -- "${BASH_PROFILE}")"
policy_install_started=1
install -m 0644 "${sshd_candidate}" "${SSHD_CONFIG}"
install -m 0644 "${bash_candidate}" "${BASH_PROFILE}"
install -o "${CODEX_USER}" -g "${CODEX_USER}" -m 0644 \
  "${zshrc_candidate}" "${ZSHRC_DESTINATION}"

"${SSHD_BIN}" -t
validate_ssh_policy '' 'installed'
"${SYSTEMCTL_BIN}" reload ssh.service
policy_committed=1

log 'vscode-only SSH, Bash, and Zsh Codex command paths configured and validated'
