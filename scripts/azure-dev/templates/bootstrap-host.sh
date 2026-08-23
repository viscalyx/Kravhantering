#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${AZURE_DEV_REPO_URL:-https://github.com/viscalyx/Kravhantering.git}"
WORKSPACE_DIR="/workspace"
DATA_DEVICE="/dev/disk/azure/scsi1/lun0"
DATA_FSTYPE="ext4"
DATA_MOUNT_DIR="/mnt/krav-azure-dev-data"
DATA_WORKSPACE_DIR="${DATA_MOUNT_DIR}/workspace"
DATA_HOST_STATE_DIR="${DATA_MOUNT_DIR}/host-state"
VSCODE_USER="vscode"
VSCODE_HOME="/home/${VSCODE_USER}"
DATA_PODMAN_STORAGE_DIR="${DATA_MOUNT_DIR}/home/${VSCODE_USER}/.local/share/containers/storage"
PODMAN_STORAGE_DIR="${VSCODE_HOME}/.local/share/containers/storage"
DATA_VSCODE_SERVER_DIR="${DATA_MOUNT_DIR}/home/${VSCODE_USER}/.vscode-server"
VSCODE_SERVER_DIR="${VSCODE_HOME}/.vscode-server"
DATA_CODEX_HOME_DIR="${DATA_MOUNT_DIR}/home/${VSCODE_USER}/.codex"
CODEX_HOME_DIR="${VSCODE_HOME}/.codex"
DATA_VSCODE_CACHE_DIR="${DATA_MOUNT_DIR}/home/${VSCODE_USER}/.cache"
VSCODE_CACHE_DIR="${VSCODE_HOME}/.cache"
DATA_VSCODE_TEMP_DIR="${DATA_MOUNT_DIR}/home/${VSCODE_USER}/tmp"
VSCODE_TEMP_DIR="/var/tmp/krav-vscode"
DATA_VSCODE_NPM_CACHE_DIR="${DATA_MOUNT_DIR}/cache/npm/vscode"
DATA_ROOT_NPM_CACHE_DIR="${DATA_MOUNT_DIR}/cache/npm/root"
DATA_DOCKER_DIR="${DATA_MOUNT_DIR}/var/lib/docker"
DOCKER_DIR="/var/lib/docker"
DATA_CONTAINERD_DIR="${DATA_MOUNT_DIR}/var/lib/containerd"
CONTAINERD_DIR="/var/lib/containerd"
SYSTEMD_USER_DIR="${VSCODE_HOME}/.config/containers/systemd"
KRAV_CONFIG_DIR="${VSCODE_HOME}/.config/krav-dev"
STORAGE_SHELL_ENV="${KRAV_CONFIG_DIR}/storage-env.zsh"
HOST_STATE_DIR="/var/lib/krav-azure-dev"
QUADLET_SOURCE_DIR="${AZURE_DEV_QUADLET_SOURCE:-${WORKSPACE_DIR}/scripts/azure-dev/templates/quadlet}"
ZSHRC_SOURCE="${AZURE_DEV_ZSHRC_SOURCE:-${WORKSPACE_DIR}/scripts/azure-dev/templates/zshrc.template.example}"
SERVICE_ENV_SOURCE_DIR="${AZURE_DEV_SERVICE_ENV_SOURCE:-}"
CODEX_CONFIG_SOURCE="${AZURE_DEV_CODEX_CONFIG_SOURCE:-${WORKSPACE_DIR}/scripts/azure-dev/templates/codex-config.toml}"
CODEX_CONFIG_MERGER="${AZURE_DEV_CODEX_CONFIG_MERGER:-${WORKSPACE_DIR}/scripts/azure-dev/templates/merge-codex-config.py}"
CODEX_INSTALLER="${AZURE_DEV_CODEX_INSTALLER:-${WORKSPACE_DIR}/scripts/azure-dev/templates/install-codex.sh}"
DOTENV_LINTER_INSTALLER="${AZURE_DEV_DOTENV_LINTER_INSTALLER:-${WORKSPACE_DIR}/scripts/azure-dev/templates/install-dotenv-linter.sh}"
APT_KEY_VERIFIER="${AZURE_DEV_APT_KEY_VERIFIER:-${WORKSPACE_DIR}/scripts/azure-dev/templates/verify-apt-key.sh}"
ROLLING_GIT_INSTALLER="${AZURE_DEV_ROLLING_GIT_INSTALLER:-${WORKSPACE_DIR}/scripts/azure-dev/templates/install-rolling-git-source.sh}"
STORAGE_REPORT_SOURCE="${AZURE_DEV_STORAGE_REPORT_SOURCE:-${WORKSPACE_DIR}/scripts/azure-dev/templates/storage-report.sh}"
GIT_USER_NAME="${AZURE_DEV_GIT_USER_NAME:-}"
GIT_USER_EMAIL="${AZURE_DEV_GIT_USER_EMAIL:-}"
GIT_SSH_SIGNING_PUBLIC_KEY="${AZURE_DEV_GIT_SSH_SIGNING_PUBLIC_KEY:-}"
CODEX_INSTALL_HOME="/usr/local/lib/codex"
SSHD_ROOT_LOGIN_CONFIG="/etc/ssh/sshd_config.d/00-kravhantering-root-login.conf"
SSHD_ENVIRONMENT_CONFIG="/etc/ssh/sshd_config.d/01-kravhantering-environment.conf"
LYCHEE_VERSION="v0.24.2"

log() {
  printf '[krav-azure-bootstrap] %s\n' "$*"
}

cleanup_service_environment_source() {
  if [ -z "${SERVICE_ENV_SOURCE_DIR}" ]; then
    return
  fi
  rm -f \
    "${SERVICE_ENV_SOURCE_DIR}/sqlserver.env" \
    "${SERVICE_ENV_SOURCE_DIR}/keycloak.env" \
    "${SERVICE_ENV_SOURCE_DIR}/ubuntu-pro-attach.yaml"
  rmdir "${SERVICE_ENV_SOURCE_DIR}" 2>/dev/null || true
}

trap cleanup_service_environment_source EXIT

run_as_vscode() {
  runuser -u "${VSCODE_USER}" -- env \
    HOME="${VSCODE_HOME}" \
    XDG_CONFIG_HOME="${VSCODE_HOME}/.config" \
    XDG_DATA_HOME="${VSCODE_HOME}/.local/share" \
    TMPDIR="${VSCODE_TEMP_DIR}" \
    TMP="${VSCODE_TEMP_DIR}" \
    TEMP="${VSCODE_TEMP_DIR}" \
    npm_config_cache="${DATA_VSCODE_NPM_CACHE_DIR}" \
    CONTAINERS_CONF="${VSCODE_HOME}/.config/containers/containers.conf" \
    CONTAINERS_STORAGE_CONF="${VSCODE_HOME}/.config/containers/storage.conf" \
    bash -lc "$*"
}

ensure_vscode_user() {
  if ! id "${VSCODE_USER}" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/zsh "${VSCODE_USER}"
  fi
  usermod --shell /bin/zsh "${VSCODE_USER}"
  usermod --append --groups sudo,docker "${VSCODE_USER}" || true
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0750 \
    "${VSCODE_HOME}"
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "${VSCODE_HOME}/.cache" \
    "${VSCODE_HOME}/.config" \
    "${VSCODE_HOME}/.local" \
    "${VSCODE_HOME}/.local/share" \
    "${VSCODE_HOME}/.local/state"
  install -d -m 0755 /etc/sudoers.d
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${VSCODE_USER}" \
    > /etc/sudoers.d/90-krav-vscode
  chmod 0440 /etc/sudoers.d/90-krav-vscode
}

configure_git_identity() {
  if [ -z "${GIT_USER_NAME}" ] || [ -z "${GIT_USER_EMAIL}" ]; then
    log 'Git user name and email are required for the vscode user'
    return 1
  fi

  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global user.name "${GIT_USER_NAME}"
  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global user.email "${GIT_USER_EMAIL}"

  if [ -z "${GIT_SSH_SIGNING_PUBLIC_KEY}" ]; then
    return
  fi
  if [[ ! "${GIT_SSH_SIGNING_PUBLIC_KEY}" =~ ^(ssh-|ecdsa-|sk-)[^[:space:]]+[[:space:]]+[A-Za-z0-9+/]+=*([[:space:]].*)?$ ]]; then
    log 'Git SSH signing public key is invalid'
    return 1
  fi

  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global gpg.format ssh
  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global user.signingkey "key::${GIT_SSH_SIGNING_PUBLIC_KEY}"
  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global commit.gpgsign true
  runuser -u "${VSCODE_USER}" -- env HOME="${VSCODE_HOME}" \
    git config --global --unset-all gpg.ssh.program || true
}

configure_ssh_access() {
  log "configuring SSH root-login and environment policies"
  install -d -m 0755 /etc/ssh/sshd_config.d
  printf '%s\n' \
    '# Managed by Kravhantering Azure development setup.' \
    'PermitRootLogin no' \
    > "${SSHD_ROOT_LOGIN_CONFIG}"
  chmod 0644 "${SSHD_ROOT_LOGIN_CONFIG}"
  printf '%s\n' \
    '# Managed by Kravhantering Azure development setup.' \
    'AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN' \
    > "${SSHD_ENVIRONMENT_CONFIG}"
  chmod 0644 "${SSHD_ENVIRONMENT_CONFIG}"

  /usr/sbin/sshd -t
  systemctl reload ssh.service

  local root_login_policy
  root_login_policy="$(
    /usr/sbin/sshd -T \
      -C user=root,host=localhost,addr=127.0.0.1 \
      | awk '$1 == "permitrootlogin" { print $2 }'
  )"
  if [ "${root_login_policy}" != "no" ]; then
    log "effective SSH root-login policy is ${root_login_policy:-unset}; expected no"
    return 1
  fi
  if ! /usr/sbin/sshd -T \
    -C user=vscode,host=localhost,addr=127.0.0.1 \
    | grep -E '^acceptenv (.* )?GH_TOKEN( |$)' >/dev/null; then
    log "effective SSH environment policy does not accept GH_TOKEN"
    return 1
  fi
  if ! /usr/sbin/sshd -T \
    -C user=vscode,host=localhost,addr=127.0.0.1 \
    | grep -E '^acceptenv (.* )?COPILOT_GITHUB_TOKEN( |$)' >/dev/null; then
    log "effective SSH environment policy does not accept COPILOT_GITHUB_TOKEN"
    return 1
  fi
  log "SSH root-login and environment policies configured and validated"
}

configure_repositories() {
  install -d -m 0755 /etc/apt/keyrings
  rm -f /tmp/packages-microsoft-prod.deb

  if [ ! -f "${APT_KEY_VERIFIER}" ]; then
    log "APT signing-key verifier is missing: ${APT_KEY_VERIFIER}"
    return 1
  fi

  bash "${APT_KEY_VERIFIER}" \
    'NodeSource' \
    'https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key' \
    '/etc/apt/keyrings/nodesource.gpg' \
    '6F71F525282841EEDAF851B42F59B5F99B1BE0B4'
  rm -f /etc/apt/sources.list.d/nodesource.list
  cat > /etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_24.x
Suites: nodistro
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/nodesource.gpg
EOF

  bash "${APT_KEY_VERIFIER}" \
    'Docker' \
    'https://download.docker.com/linux/ubuntu/gpg' \
    '/etc/apt/keyrings/docker.gpg' \
    '9DC858229FC7DD38854AE2D88D81803C0EBFCD88'
  printf \
    'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable\n' \
    "$(dpkg --print-architecture)" \
    > /etc/apt/sources.list.d/docker.list

  bash "${APT_KEY_VERIFIER}" \
    'GitHub CLI' \
    'https://cli.github.com/packages/githubcli-archive-keyring.gpg' \
    '/usr/share/keyrings/githubcli-archive-keyring.gpg' \
    '2C6106201985B60E6C7AC87323F3D4EA75716059' \
    '7F38BBB59D064DBCB3D84D725612B36462313325'
  printf \
    'deb [arch=%s signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
    "$(dpkg --print-architecture)" \
    > /etc/apt/sources.list.d/github-cli.list
}

install_host_packages() {
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg

  configure_repositories
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    aardvark-dns \
    apparmor-profiles \
    apparmor-utils \
    build-essential \
    btop \
    bubblewrap \
    dbus-user-session \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
    dotnet-sdk-8.0 \
    e2fsprogs \
    fuse-overlayfs \
    gh \
    git \
    jq \
    libnss3-tools \
    lsb-release \
    mkcert \
    netavark \
    nodejs \
    podman \
    podman-compose \
    python-is-python3 \
    python3 \
    python3-pip \
    python3-venv \
    python3-yaml \
    ripgrep \
    slirp4netns \
    socat \
    sudo \
    uidmap \
    unzip \
    ubuntu-pro-client \
    wget \
    zsh

  if [ ! -f "${DOTENV_LINTER_INSTALLER}" ]; then
    log "dotenv-linter installer helper is missing: ${DOTENV_LINTER_INSTALLER}"
    return 1
  fi
  DOTENV_LINTER_INSTALL_DIR=/usr/local/bin \
    bash "${DOTENV_LINTER_INSTALLER}"
}

install_ai_tools() {
  if [ ! -f "${CODEX_INSTALLER}" ]; then
    log "Codex installer helper is missing: ${CODEX_INSTALLER}"
    return 1
  fi
  if ! CODEX_HOME="${CODEX_INSTALL_HOME}" \
    CODEX_INSTALL_DIR=/usr/local/bin \
    CODEX_NON_INTERACTIVE=1 \
    bash "${CODEX_INSTALLER}"; then
    return 1
  fi

  npm_config_ignore_scripts=false \
    npm install --global @github/copilot@latest

  if grep -q '^COPILOT_AUTO_UPDATE=' /etc/environment 2>/dev/null; then
    sed -i \
      's/^COPILOT_AUTO_UPDATE=.*/COPILOT_AUTO_UPDATE=false/' \
      /etc/environment
  else
    printf 'COPILOT_AUTO_UPDATE=false\n' >> /etc/environment
  fi
  export COPILOT_AUTO_UPDATE=false

  codex --version
  copilot --version
}

install_lychee() {
  local expected_version="${LYCHEE_VERSION#v}"
  if command -v lychee >/dev/null 2>&1 &&
    [ "$(lychee --version 2>/dev/null)" = "lychee ${expected_version}" ]; then
    return
  fi

  # Provenance: these are the GitHub SHA-256 asset digests from the official
  # lychee-${LYCHEE_VERSION} release API, independently confirmed by downloading
  # both *-unknown-linux-gnu.tar.gz assets and running sha256sum. Version bumps
  # must repeat both checks and update both hashes here and in the devcontainer
  # Dockerfile; github-actions-workflow-security.test.ts enforces alignment.
  local lychee_target lychee_sha256
  case "$(dpkg --print-architecture)" in
    amd64)
      lychee_target='x86_64-unknown-linux-gnu'
      lychee_sha256='1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a'
      ;;
    arm64)
      lychee_target='aarch64-unknown-linux-gnu'
      lychee_sha256='91a7bd65685da41b90ccb9bc867a3d649a7818042dae04ff405e55a25bddee4c'
      ;;
    *)
      log "unsupported Lychee architecture: $(dpkg --print-architecture)"
      return 1
      ;;
  esac

  local lychee_archive lychee_temp_dir
  lychee_temp_dir="$(mktemp -d /tmp/krav-lychee.XXXXXX)"
  lychee_archive="${lychee_temp_dir}/lychee-${lychee_target}.tar.gz"
  if ! curl -fsSLo "${lychee_archive}" \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-${LYCHEE_VERSION}/lychee-${lychee_target}.tar.gz"; then
    rm -rf "${lychee_temp_dir}"
    return 1
  fi
  if ! printf '%s  %s\n' "${lychee_sha256}" "${lychee_archive}" \
    | sha256sum --check --status; then
    log "Lychee ${LYCHEE_VERSION} archive checksum validation failed"
    rm -rf "${lychee_temp_dir}"
    return 1
  fi

  tar -xzf "${lychee_archive}" --strip-components=1 -C "${lychee_temp_dir}"
  install -m 0755 "${lychee_temp_dir}/lychee" /usr/local/bin/lychee
  rm -rf "${lychee_temp_dir}"
  lychee --version
}

configure_optional_ubuntu_pro() {
  local attach_config="${SERVICE_ENV_SOURCE_DIR}/ubuntu-pro-attach.yaml"
  if [ -z "${SERVICE_ENV_SOURCE_DIR}" ] || [ ! -s "${attach_config}" ]; then
    return
  fi

  local attach_exit=0
  pro attach --attach-config "${attach_config}" || attach_exit=$?
  case "${attach_exit}" in
    0)
      log 'attached VM to Ubuntu Pro'
      ;;
    2)
      log 'VM is already attached to Ubuntu Pro'
      ;;
    *)
      log "Ubuntu Pro attach failed with exit code ${attach_exit}"
      return "${attach_exit}"
      ;;
  esac
  rm -f "${attach_config}"
}

configure_codex_sandbox() {
  local profile_source="/usr/share/apparmor/extra-profiles/bwrap-userns-restrict"
  local profile_target="/etc/apparmor.d/bwrap-userns-restrict"

  if [ ! -x /usr/bin/bwrap ]; then
    log "bubblewrap is not installed at /usr/bin/bwrap"
    return 1
  fi
  if [ ! -f "${profile_source}" ]; then
    log "Bubblewrap AppArmor profile is missing: ${profile_source}"
    return 1
  fi

  install -m 0644 "${profile_source}" "${profile_target}"
  apparmor_parser -r "${profile_target}"

  if ! runuser -u "${VSCODE_USER}" -- \
    /usr/bin/bwrap \
      --ro-bind / / \
      --dev /dev \
      --proc /proc \
      --unshare-user \
      --unshare-pid \
      --unshare-net \
      -- /bin/true; then
    log "Bubblewrap cannot create the user and network namespaces required by Codex"
    return 1
  fi
  log "Codex Bubblewrap sandbox configured and validated"
}

directory_has_entries() {
  find "$1" -mindepth 1 -maxdepth 1 -print -quit | grep -q .
}

prepare_data_bind_directory() {
  local source="$1"
  local target="$2"
  local owner="$3"
  local group="$4"
  local mode="$5"

  install -d -o "${owner}" -g "${group}" -m "${mode}" \
    "${source}" \
    "${target}"
  if findmnt -M "${target}" >/dev/null 2>&1; then
    return
  fi

  if directory_has_entries "${target}"; then
    if directory_has_entries "${source}"; then
      log "cannot merge existing storage at ${target} and ${source}; reprovision the temporary environment"
      return 1
    fi
    cp -a "${target}/." "${source}/"
    find "${target}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  fi

  chown "${owner}:${group}" "${source}" "${target}"
  chmod "${mode}" "${source}" "${target}"
}

append_data_bind_mount() {
  local source="$1"
  local target="$2"

  printf '%s %s none bind,nofail,x-systemd.requires-mounts-for=%s 0 0\n' \
    "${source}" \
    "${target}" \
    "${DATA_MOUNT_DIR}" \
    >> /etc/fstab
}

mount_data_disk() {
  install -d -m 0755 \
    "${DATA_MOUNT_DIR}" \
    "${WORKSPACE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${PODMAN_STORAGE_DIR}" \
    "${VSCODE_SERVER_DIR}" \
    "${CODEX_HOME_DIR}" \
    "${VSCODE_CACHE_DIR}" \
    "${VSCODE_TEMP_DIR}" \
    "${DOCKER_DIR}" \
    "${CONTAINERD_DIR}"
  if [ ! -e "${DATA_DEVICE}" ]; then
    log "Azure data disk not found at ${DATA_DEVICE}; managed development storage has no OS-disk fallback"
    return 1
  fi

  local data_block_device
  local data_block_name
  local data_rescan_path
  data_block_device="$(readlink -f "${DATA_DEVICE}")"
  data_block_name="$(basename "${data_block_device}")"
  data_rescan_path="/sys/class/block/${data_block_name}/device/rescan"
  if [ ! -w "${data_rescan_path}" ]; then
    log "Azure data disk rescan path is unavailable: ${data_rescan_path}"
    return 1
  fi
  printf '1\n' > "${data_rescan_path}"

  if ! blkid "${DATA_DEVICE}" >/dev/null 2>&1; then
    mkfs.ext4 -F "${DATA_DEVICE}"
  else
    local data_fstype
    data_fstype="$(blkid -s TYPE -o value "${DATA_DEVICE}")"
    if [ "${data_fstype}" != "${DATA_FSTYPE}" ]; then
      log "Azure data disk uses ${data_fstype}; expected ${DATA_FSTYPE}"
      return 1
    fi
    resize2fs "${DATA_DEVICE}"
  fi

  local uuid
  uuid="$(blkid -s UUID -o value "${DATA_DEVICE}")"

  local fstab_tmp
  fstab_tmp="$(mktemp)"
  awk \
    -v uuid="${uuid}" \
    -v data_mount="${DATA_MOUNT_DIR}" \
    -v workspace="${WORKSPACE_DIR}" \
    -v host_state="${HOST_STATE_DIR}" \
    -v podman_storage="${PODMAN_STORAGE_DIR}" \
    -v vscode_server="${VSCODE_SERVER_DIR}" \
    -v codex_home="${CODEX_HOME_DIR}" \
    -v vscode_cache="${VSCODE_CACHE_DIR}" \
    -v vscode_temp="${VSCODE_TEMP_DIR}" \
    -v docker_storage="${DOCKER_DIR}" \
    -v containerd_storage="${CONTAINERD_DIR}" \
    '$1 == "UUID=" uuid { next }
     $2 == data_mount { next }
     $2 == workspace { next }
     $2 == host_state { next }
     $2 == podman_storage { next }
     $2 == vscode_server { next }
     $2 == codex_home { next }
     $2 == vscode_cache { next }
     $2 == vscode_temp { next }
     $2 == docker_storage { next }
     $2 == containerd_storage { next }
     { print }' \
    /etc/fstab > "${fstab_tmp}"
  cat "${fstab_tmp}" > /etc/fstab
  rm -f "${fstab_tmp}"
  printf 'UUID=%s %s %s defaults,nofail 0 2\n' \
    "${uuid}" \
    "${DATA_MOUNT_DIR}" \
    "${DATA_FSTYPE}" \
    >> /etc/fstab
  append_data_bind_mount "${DATA_WORKSPACE_DIR}" "${WORKSPACE_DIR}"
  append_data_bind_mount "${DATA_HOST_STATE_DIR}" "${HOST_STATE_DIR}"
  append_data_bind_mount "${DATA_PODMAN_STORAGE_DIR}" "${PODMAN_STORAGE_DIR}"
  append_data_bind_mount "${DATA_VSCODE_SERVER_DIR}" "${VSCODE_SERVER_DIR}"
  append_data_bind_mount "${DATA_CODEX_HOME_DIR}" "${CODEX_HOME_DIR}"
  append_data_bind_mount "${DATA_VSCODE_CACHE_DIR}" "${VSCODE_CACHE_DIR}"
  append_data_bind_mount "${DATA_VSCODE_TEMP_DIR}" "${VSCODE_TEMP_DIR}"
  append_data_bind_mount "${DATA_DOCKER_DIR}" "${DOCKER_DIR}"
  append_data_bind_mount "${DATA_CONTAINERD_DIR}" "${CONTAINERD_DIR}"

  if ! findmnt "${DATA_MOUNT_DIR}" >/dev/null 2>&1; then
    mount "${DATA_MOUNT_DIR}"
  fi

  prepare_data_bind_directory \
    "${DATA_WORKSPACE_DIR}" "${WORKSPACE_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0755
  prepare_data_bind_directory \
    "${DATA_HOST_STATE_DIR}" "${HOST_STATE_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0755
  prepare_data_bind_directory \
    "${DATA_PODMAN_STORAGE_DIR}" "${PODMAN_STORAGE_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0750
  prepare_data_bind_directory \
    "${DATA_VSCODE_SERVER_DIR}" "${VSCODE_SERVER_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0750
  prepare_data_bind_directory \
    "${DATA_CODEX_HOME_DIR}" "${CODEX_HOME_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0700
  prepare_data_bind_directory \
    "${DATA_VSCODE_CACHE_DIR}" "${VSCODE_CACHE_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0700
  prepare_data_bind_directory \
    "${DATA_VSCODE_TEMP_DIR}" "${VSCODE_TEMP_DIR}" \
    "${VSCODE_USER}" "${VSCODE_USER}" 0700
  prepare_data_bind_directory \
    "${DATA_DOCKER_DIR}" "${DOCKER_DIR}" root root 0711
  prepare_data_bind_directory \
    "${DATA_CONTAINERD_DIR}" "${CONTAINERD_DIR}" root root 0711

  local bind_mount
  for bind_mount in \
    "${WORKSPACE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${PODMAN_STORAGE_DIR}" \
    "${VSCODE_SERVER_DIR}" \
    "${CODEX_HOME_DIR}" \
    "${VSCODE_CACHE_DIR}" \
    "${VSCODE_TEMP_DIR}" \
    "${DOCKER_DIR}" \
    "${CONTAINERD_DIR}"; do
    if ! findmnt -M "${bind_mount}" >/dev/null 2>&1; then
      mount "${bind_mount}"
    fi
  done

  rm -rf \
    "${DATA_MOUNT_DIR}/lost+found" \
    "${HOST_STATE_DIR}/lost+found" \
    "${WORKSPACE_DIR}/lost+found" \
    "${PODMAN_STORAGE_DIR}/lost+found" \
    "${VSCODE_SERVER_DIR}/lost+found" \
    "${CODEX_HOME_DIR}/lost+found" \
    "${VSCODE_CACHE_DIR}/lost+found" \
    "${VSCODE_TEMP_DIR}/lost+found" \
    "${DOCKER_DIR}/lost+found" \
    "${CONTAINERD_DIR}/lost+found"
  chown "${VSCODE_USER}:${VSCODE_USER}" \
    "${DATA_WORKSPACE_DIR}" \
    "${DATA_HOST_STATE_DIR}" \
    "${DATA_PODMAN_STORAGE_DIR}" \
    "${WORKSPACE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${PODMAN_STORAGE_DIR}" \
    "${DATA_VSCODE_SERVER_DIR}" \
    "${VSCODE_SERVER_DIR}" \
    "${DATA_CODEX_HOME_DIR}" \
    "${CODEX_HOME_DIR}" \
    "${DATA_VSCODE_CACHE_DIR}" \
    "${VSCODE_CACHE_DIR}" \
    "${DATA_VSCODE_TEMP_DIR}" \
    "${VSCODE_TEMP_DIR}"
}

configure_podman_storage() {
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" \
    "${VSCODE_HOME}/.config/containers" \
    "${VSCODE_HOME}/.local/share" \
    "${PODMAN_STORAGE_DIR}"

  cat > "${VSCODE_HOME}/.config/containers/storage.conf" <<EOF
[storage]
driver = "overlay"
graphroot = "${PODMAN_STORAGE_DIR}"
rootless_storage_path = "${PODMAN_STORAGE_DIR}"

[storage.options]
mount_program = "/usr/bin/fuse-overlayfs"
EOF

  cat > "${VSCODE_HOME}/.config/containers/containers.conf" <<'EOF'
[network]
network_backend = "netavark"
EOF

  chown -R "${VSCODE_USER}:${VSCODE_USER}" "${VSCODE_HOME}/.config/containers"
  chown -R "${VSCODE_USER}:${VSCODE_USER}" "${PODMAN_STORAGE_DIR}"
}

install_service_environment_files() {
  if [ -z "${SERVICE_ENV_SOURCE_DIR}" ] ||
    [ ! -f "${SERVICE_ENV_SOURCE_DIR}/sqlserver.env" ] ||
    [ ! -f "${SERVICE_ENV_SOURCE_DIR}/keycloak.env" ]; then
    log 'support-service environment files are missing; configure MSSQL_SA_PASSWORD and KEYCLOAK_ADMIN_PASSWORD before setup'
    return 1
  fi

  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "${KRAV_CONFIG_DIR}"
  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0600 \
    "${SERVICE_ENV_SOURCE_DIR}/sqlserver.env" \
    "${KRAV_CONFIG_DIR}/sqlserver.env"
  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0600 \
    "${SERVICE_ENV_SOURCE_DIR}/keycloak.env" \
    "${KRAV_CONFIG_DIR}/keycloak.env"
  cleanup_service_environment_source
  SERVICE_ENV_SOURCE_DIR=''
}

stop_user_quadlet_services_before_storage_change() {
  local uid
  uid="$(id -u "${VSCODE_USER}" 2>/dev/null || true)"
  if [ -z "${uid}" ] || [ ! -d "/run/user/${uid}" ]; then
    return
  fi

  runuser -u "${VSCODE_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" \
    systemctl --user stop \
      krav-kong.service \
      krav-hsa-person-lookup-adapter.service \
      krav-hsa-directory-mock.service \
      krav-db.service \
      krav-idp.service \
      krav-hsa-mtls-cert-generator.service \
      krav-support-network.service || true
}

stop_docker_services_before_storage_change() {
  systemctl stop docker.service docker.socket containerd.service || true
}

start_docker_services_after_storage_change() {
  systemctl start docker.service
}

clone_or_update_repo() {
  if [ -d "${WORKSPACE_DIR}/.git" ]; then
    run_as_vscode "git -C '${WORKSPACE_DIR}' remote set-url origin '${REPO_URL}'"
  else
    rm -rf "${WORKSPACE_DIR}/lost+found"
    if find "${WORKSPACE_DIR}" \
      -mindepth 1 \
      -maxdepth 1 \
      -print \
      -quit | grep -q .; then
      log "${WORKSPACE_DIR} exists without .git and contains unmanaged files"
      find "${WORKSPACE_DIR}" -mindepth 1 -maxdepth 1 -print
      return 1
    fi

    local clone_dir
    clone_dir="$(mktemp -d "${VSCODE_TEMP_DIR}/krav-bootstrap-repo.XXXXXX")"
    chown "${VSCODE_USER}:${VSCODE_USER}" "${clone_dir}"
    run_as_vscode "git clone '${REPO_URL}' '${clone_dir}'"
    run_as_vscode "cd '${clone_dir}' && tar cf - . | tar -C '${WORKSPACE_DIR}' -xf -"
    rm -rf "${clone_dir}"
  fi
  if ! git config --system --get-all safe.directory |
    grep -Fxq -- "${WORKSPACE_DIR}"; then
    git config --system --add safe.directory "${WORKSPACE_DIR}"
  fi
  chown -R "${VSCODE_USER}:${VSCODE_USER}" "${WORKSPACE_DIR}"
}

ensure_kong_route_protocols() {
  local kong_config="${WORKSPACE_DIR}/containers/kong/kong.yml"
  if [ ! -f "${kong_config}" ]; then
    log "Kong config is missing: ${kong_config}"
    return 1
  fi

  runuser -u "${VSCODE_USER}" -- env \
    HOME="${VSCODE_HOME}" \
    python3 - "${kong_config}" <<'PY'
from pathlib import Path
import sys

import yaml

path = Path(sys.argv[1])
data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
expected = {'http', 'https'}
changed = False
found = False

for service in data.get('services') or []:
    for route in service.get('routes') or []:
        if route.get('name') != 'hsa-directory-person-lookup-rest':
            continue
        found = True
        protocols = route.get('protocols')
        if not isinstance(protocols, list) or not expected.issubset(set(protocols)):
            route['protocols'] = ['http', 'https']
            changed = True

if not found:
    raise SystemExit('Kong route hsa-directory-person-lookup-rest not found')

if changed:
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding='utf-8')
    print('updated Kong route protocols in /workspace/containers/kong/kong.yml')
else:
    print('Kong route protocols already configured')
PY
}

install_zsh_profile() {
  if [ ! -f "${ROLLING_GIT_INSTALLER}" ]; then
    log "Rolling Git installer helper is missing: ${ROLLING_GIT_INSTALLER}"
    return 1
  fi
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh" ]; then
    run_as_vscode \
      "bash '${ROLLING_GIT_INSTALLER}' 'https://github.com/ohmyzsh/ohmyzsh.git' 'master' '${VSCODE_HOME}/.oh-my-zsh'"
  fi

  run_as_vscode \
    "mkdir -p '${VSCODE_HOME}/.oh-my-zsh/custom/plugins' '${VSCODE_HOME}/.oh-my-zsh/custom/themes'"
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-autosuggestions" ]; then
    run_as_vscode \
      "bash '${ROLLING_GIT_INSTALLER}' 'https://github.com/zsh-users/zsh-autosuggestions.git' 'master' '${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-autosuggestions'"
  fi
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" ]; then
    run_as_vscode \
      "bash '${ROLLING_GIT_INSTALLER}' 'https://github.com/zsh-users/zsh-syntax-highlighting.git' 'master' '${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting'"
  fi

  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh/custom/themes/powerlevel10k" ]; then
    run_as_vscode \
      "bash '${ROLLING_GIT_INSTALLER}' 'https://github.com/romkatv/powerlevel10k.git' 'master' '${VSCODE_HOME}/.oh-my-zsh/custom/themes/powerlevel10k'"
  fi

  if [ ! -f "${ZSHRC_SOURCE}" ]; then
    log "Zsh template not found: ${ZSHRC_SOURCE}"
    return 1
  fi
  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0644 \
    "${ZSHRC_SOURCE}" \
    "${VSCODE_HOME}/.zshrc"
}

configure_npm_caches() {
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "${DATA_VSCODE_NPM_CACHE_DIR}"
  install -d -o root -g root -m 0700 "${DATA_ROOT_NPM_CACHE_DIR}"

  HOME=/root npm_config_cache="${DATA_ROOT_NPM_CACHE_DIR}" \
    npm config set cache "${DATA_ROOT_NPM_CACHE_DIR}" --location=user
  runuser -u "${VSCODE_USER}" -- env \
    HOME="${VSCODE_HOME}" \
    npm_config_cache="${DATA_VSCODE_NPM_CACHE_DIR}" \
    npm config set cache "${DATA_VSCODE_NPM_CACHE_DIR}" --location=user
}

install_storage_tools() {
  local zshrc_with_storage

  if [ ! -f "${STORAGE_REPORT_SOURCE}" ]; then
    log "Storage report helper is missing: ${STORAGE_REPORT_SOURCE}"
    return 1
  fi

  install -o root -g root -m 0755 \
    "${STORAGE_REPORT_SOURCE}" \
    /usr/local/bin/storage-report
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "${KRAV_CONFIG_DIR}"
  cat > "${STORAGE_SHELL_ENV}" <<EOF
export TMPDIR="${VSCODE_TEMP_DIR}"
export TMP="${VSCODE_TEMP_DIR}"
export TEMP="${VSCODE_TEMP_DIR}"
export npm_config_cache="${DATA_VSCODE_NPM_CACHE_DIR}"

if [[ -o interactive ]] && command -v storage-report >/dev/null 2>&1; then
  storage-report --check
fi
EOF
  chown "${VSCODE_USER}:${VSCODE_USER}" "${STORAGE_SHELL_ENV}"
  chmod 0600 "${STORAGE_SHELL_ENV}"

  zshrc_with_storage="$(mktemp)"
  cat > "${zshrc_with_storage}" <<EOF
# Managed Azure development storage environment.
source "${STORAGE_SHELL_ENV}"

EOF
  cat "${VSCODE_HOME}/.zshrc" >> "${zshrc_with_storage}"
  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0644 \
    "${zshrc_with_storage}" \
    "${VSCODE_HOME}/.zshrc"
  rm -f "${zshrc_with_storage}"
}

configure_codex_home() {
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "${CODEX_HOME_DIR}" \
    "${CODEX_HOME_DIR}/sqlite" \
    "${CODEX_HOME_DIR}/tmp"

  if [ ! -f "${CODEX_CONFIG_SOURCE}" ]; then
    log "Azure Codex configuration is missing: ${CODEX_CONFIG_SOURCE}"
    return 1
  fi
  if [ ! -f "${CODEX_CONFIG_MERGER}" ]; then
    log "Azure Codex configuration merger is missing: ${CODEX_CONFIG_MERGER}"
    return 1
  fi

  runuser -u "${VSCODE_USER}" -- \
    python3 "${CODEX_CONFIG_MERGER}" \
      "${CODEX_CONFIG_SOURCE}" \
      "${CODEX_HOME_DIR}/config.toml"
  chown "${VSCODE_USER}:${VSCODE_USER}" "${CODEX_HOME_DIR}/config.toml"
  chmod 0600 "${CODEX_HOME_DIR}/config.toml"
  log "Azure Codex permission profile merged into ${CODEX_HOME_DIR}/config.toml"
}

link_playwright_chrome() {
  local browser_root="${PLAYWRIGHT_BROWSERS_PATH:-${VSCODE_HOME}/.cache/ms-playwright}"
  local chrome_bin=""
  if [ -d "${browser_root}" ]; then
    chrome_bin="$(
      find "${browser_root}" \
        \( -path '*/chrome-linux/chrome' -o -path '*/chrome-linux64/chrome' \) \
        -type f 2>/dev/null |
        sort -V |
        tail -n 1
    )"
  fi

  if [ -z "${chrome_bin}" ]; then
    local candidate candidate_path resolved_path
    for candidate in chromium-browser chromium google-chrome chrome; do
      if candidate_path="$(command -v "${candidate}" 2>/dev/null)"; then
        resolved_path="$(readlink -f "${candidate_path}" 2>/dev/null || printf '%s' "${candidate_path}")"
        if [ -x "${resolved_path}" ] && [ "${resolved_path}" != "/opt/google/chrome/chrome" ]; then
          chrome_bin="${resolved_path}"
          break
        fi
      fi
    done
  fi

  if [ -z "${chrome_bin}" ]; then
    log "could not find a Playwright or system Chromium executable"
    return 1
  fi

  install -d /opt/google/chrome
  ln -sf "${chrome_bin}" /opt/google/chrome/chrome
  log "linked /opt/google/chrome/chrome -> ${chrome_bin}"
  /opt/google/chrome/chrome --version
}

run_repository_setup() {
  (
    cd "${WORKSPACE_DIR}"
    node scripts/install-repository-npm.mjs
  )
  run_as_vscode "cd '${WORKSPACE_DIR}' && node scripts/provision-ai-provider-secret-keyring.mjs"
  run_as_vscode "cd '${WORKSPACE_DIR}' && npm install"
  run_as_vscode "cd '${WORKSPACE_DIR}' && dotnet tool restore"
  run_as_vscode "cd '${WORKSPACE_DIR}' && npx playwright install --with-deps"
  link_playwright_chrome
  run_as_vscode "cd '${WORKSPACE_DIR}' && bash .devcontainer/trust-container-ca.sh"
}

generate_sql_password() {
  python3 - <<'PY'
import secrets
import string

alphabet = string.ascii_letters + string.digits + "!@^_-"
characters = [
    secrets.choice(string.ascii_lowercase),
    secrets.choice(string.ascii_uppercase),
    secrets.choice(string.digits),
    secrets.choice("!@^_-"),
]
characters.extend(secrets.choice(alphabet) for _ in range(28))
secrets.SystemRandom().shuffle(characters)
print("".join(characters))
PY
}

read_managed_env_value() {
  local file="$1"
  local start="$2"
  local end="$3"
  local key="$4"

  if [ ! -r "${file}" ]; then
    return
  fi

  awk -v start="${start}" -v end="${end}" -v key="${key}" '
    $0 == start { managed = 1; next }
    $0 == end { managed = 0; next }
    managed == 1 && index($0, key "=") == 1 {
      print substr($0, length(key) + 2)
      exit
    }
  ' "${file}"
}

write_vm_env_override() {
  local file="${WORKSPACE_DIR}/.env.development.local"
  local start="# >>> kravhantering azure vm managed"
  local end="# <<< kravhantering azure vm managed"
  local tmp
  local sa_password
  local app_password
  local migration_password
  local sqlserver_env="${KRAV_CONFIG_DIR}/sqlserver.env"

  if [ ! -r "${sqlserver_env}" ]; then
    log "SQL Server environment file is missing or unreadable: ${sqlserver_env}"
    return 1
  fi

  sa_password="$(sed -n 's/^MSSQL_SA_PASSWORD=//p' "${sqlserver_env}")"
  if [ -z "${sa_password}" ]; then
    log "MSSQL_SA_PASSWORD is missing or empty in ${sqlserver_env}"
    return 1
  fi

  app_password="$(
    read_managed_env_value "${file}" "${start}" "${end}" \
      DB_BOOTSTRAP_APP_PASSWORD
  )"
  migration_password="$(
    read_managed_env_value "${file}" "${start}" "${end}" \
      DB_MIGRATION_PASSWORD
  )"
  if [ -z "${app_password}" ]; then
    app_password="$(generate_sql_password)"
  fi
  if [ -z "${migration_password}" ]; then
    migration_password="$(generate_sql_password)"
  fi
  while [ "${migration_password}" = "${app_password}" ]; do
    migration_password="$(generate_sql_password)"
  done

  tmp="$(mktemp)"

  if [ -f "${file}" ]; then
    awk -v start="${start}" -v end="${end}" '
      $0 == start { skip = 1; next }
      $0 == end { skip = 0; next }
      skip != 1 { print }
    ' "${file}" > "${tmp}"
  fi

  {
    printf '%s\n' "${start}"
    printf 'DB_BOOTSTRAP_ADMIN_PASSWORD=%s\n' "${sa_password}"
    printf 'DB_BOOTSTRAP_ADMIN_USER=sa\n'
    printf 'DB_BOOTSTRAP_APP_PASSWORD=%s\n' "${app_password}"
    printf 'DB_BOOTSTRAP_APP_USER=kravhantering_app\n'
    printf 'DB_HOST=127.0.0.1\n'
    printf 'DB_MIGRATION_PASSWORD=%s\n' "${migration_password}"
    printf 'DB_MIGRATION_USER=kravhantering_job\n'
    printf 'DB_PASSWORD=%s\n' "${app_password}"
    printf 'DB_RUNTIME_USER=kravhantering_app\n'
    printf 'DB_USER=kravhantering_app\n'
    printf 'MSSQL_SA_PASSWORD=%s\n' "${sa_password}"
    printf 'HSA_PERSON_LOOKUP_URL=http://127.0.0.1:18000/hsa/person-records/lookup\n'
    printf '%s\n' "${end}"
  } >> "${tmp}"

  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0600 "${tmp}" "${file}"
  rm -f "${tmp}"
}

install_quadlet_units() {
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" \
    "${SYSTEMD_USER_DIR}" \
    "${KRAV_CONFIG_DIR}"

  if [ ! -d "${QUADLET_SOURCE_DIR}" ]; then
    log "Quadlet template directory not found: ${QUADLET_SOURCE_DIR}"
    return 1
  fi

  local quadlet_files=("${QUADLET_SOURCE_DIR}"/*)
  if [ ! -e "${quadlet_files[0]}" ]; then
    log "Quadlet template directory contains no files: ${QUADLET_SOURCE_DIR}"
    return 1
  fi

  install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0644 \
    "${quadlet_files[@]}" \
    "${SYSTEMD_USER_DIR}/"

  chown -R "${VSCODE_USER}:${VSCODE_USER}" "${KRAV_CONFIG_DIR}"
  chmod 0600 "${KRAV_CONFIG_DIR}"/*.env
}

build_hsa_images_once() {
  local no_cache_option=""
  if [ "${1:-}" = "no-cache" ]; then
    no_cache_option="--no-cache "
  fi

  run_as_vscode \
    "cd '${WORKSPACE_DIR}' && podman build ${no_cache_option}--tag localhost/kravhantering/hsa-person-lookup-adapter:local --file containers/hsa-person-lookup-adapter/Dockerfile containers/hsa-person-lookup-adapter" ||
    return
  run_as_vscode \
    "cd '${WORKSPACE_DIR}' && podman build ${no_cache_option}--tag localhost/kravhantering/hsa-directory-mock:local --file containers/hsa-directory-mock/Dockerfile containers/hsa-directory-mock"
}

build_hsa_images() {
  local build_log
  build_log="$(mktemp "${VSCODE_TEMP_DIR}/krav-podman-build.XXXXXX")"

  if build_hsa_images_once 2>&1 | tee "${build_log}"; then
    rm -f "${build_log}"
    return
  fi

  if ! grep -Eqi \
    'layer not known|exists in local storage but may be corrupted' \
    "${build_log}"; then
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  log "Podman image-layer metadata is inconsistent; pruning disposable build state and retrying without cache"
  run_as_vscode "podman system prune --external --force" ||
    log "Podman external-layer cleanup reported an error; continuing with unused-image cleanup"
  run_as_vscode "podman system prune --all --build --force" ||
    log "Podman unused-image cleanup reported an error; continuing with a cache-free rebuild"

  build_hsa_images_once no-cache
}

run_user_systemctl() {
  local uid="$1"
  shift
  runuser -u "${VSCODE_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" \
    systemctl --user "$@"
}

run_user_podman() {
  local uid="$1"
  shift
  runuser -u "${VSCODE_USER}" -- env \
    HOME="${VSCODE_HOME}" \
    XDG_CONFIG_HOME="${VSCODE_HOME}/.config" \
    XDG_DATA_HOME="${VSCODE_HOME}/.local/share" \
    XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" \
    CONTAINERS_CONF="${VSCODE_HOME}/.config/containers/containers.conf" \
    CONTAINERS_STORAGE_CONF="${VSCODE_HOME}/.config/containers/storage.conf" \
    podman "$@"
}

configure_user_systemd_environment() {
  local uid="$1"

  run_user_systemctl "${uid}" set-environment \
    "HOME=${VSCODE_HOME}" \
    "XDG_CONFIG_HOME=${VSCODE_HOME}/.config" \
    "XDG_DATA_HOME=${VSCODE_HOME}/.local/share" \
    "XDG_RUNTIME_DIR=/run/user/${uid}" \
    "TMPDIR=${VSCODE_TEMP_DIR}" \
    "TMP=${VSCODE_TEMP_DIR}" \
    "TEMP=${VSCODE_TEMP_DIR}" \
    "npm_config_cache=${DATA_VSCODE_NPM_CACHE_DIR}" \
    "CONTAINERS_CONF=${VSCODE_HOME}/.config/containers/containers.conf" \
    "CONTAINERS_STORAGE_CONF=${VSCODE_HOME}/.config/containers/storage.conf"
}

prepare_user_podman_runtime() {
  local uid="$1"

  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700 \
    "/tmp/containers-user-${uid}" \
    "/tmp/containers-user-${uid}/containers" \
    "/run/user/${uid}/containers" \
    "/run/user/${uid}/netns" \
    "/run/user/${uid}/libpod" \
    "/run/user/${uid}/libpod/tmp"

  if ! run_user_podman "${uid}" system migrate; then
    log "failed to reset rootless Podman runtime state"
    dump_support_stack_diagnostics
    return 1
  fi
}

run_user_systemctl_or_diagnose() {
  local uid="$1"
  local description="$2"
  shift 2

  local action="$1"
  shift
  local units=("$@")

  local command_failed=0
  if ! run_user_systemctl "${uid}" "${action}" "${units[@]}"; then
    command_failed=1
  fi

  if [ "${action}" = "start" ] || [ "${action}" = "restart" ]; then
    if wait_user_units_active "${uid}" "${description}" "${units[@]}"; then
      return
    fi
  elif [ "${command_failed}" -eq 0 ]; then
    return
  fi

  log "failed to ${description}"
  dump_support_stack_diagnostics
  return 1
}

wait_user_units_active() {
  local uid="$1"
  local description="$2"
  shift 2

  local unit state substate attempt stalled_attempts
  for unit in "$@"; do
    stalled_attempts=0
    for attempt in $(seq 1 150); do
      state="$(
        run_user_systemctl "${uid}" show "${unit}" -p ActiveState --value 2>/dev/null ||
          true
      )"
      substate="$(
        run_user_systemctl "${uid}" show "${unit}" -p SubState --value 2>/dev/null ||
          true
      )"

      case "${state}" in
        active)
          break
          ;;
        failed | inactive | unknown | '')
          stalled_attempts=$((stalled_attempts + 1))
          if [ "${stalled_attempts}" -ge 5 ]; then
            log "${unit} stayed in ${state:-unknown}/${substate:-unknown} while trying to ${description}"
            return 1
          fi
          ;;
        *)
          stalled_attempts=0
          ;;
      esac

      if [ "${attempt}" -eq 1 ] || [ $((attempt % 15)) -eq 0 ]; then
        log "waiting for ${unit} to become active; current state is ${state:-unknown}/${substate:-unknown}"
      fi
      sleep 2
    done

    if [ "${state}" != "active" ]; then
      log "timed out waiting for ${unit} to become active; current state is ${state:-unknown}/${substate:-unknown}"
      return 1
    fi
  done
}

ensure_base_podman_resources() {
  local uid="$1"

  if ! run_user_podman "${uid}" network exists krav-support; then
    log "creating missing Podman network krav-support"
    if ! run_user_podman "${uid}" network create krav-support; then
      log "failed to create Podman network krav-support"
      dump_support_stack_diagnostics
      return 1
    fi
  fi

  local volume
  for volume in krav-sqlserver krav-hsa-mtls-certs; do
    if ! run_user_podman "${uid}" volume exists "${volume}"; then
      log "creating missing Podman volume ${volume}"
      if ! run_user_podman "${uid}" volume create "${volume}"; then
        log "failed to create Podman volume ${volume}"
        dump_support_stack_diagnostics
        return 1
      fi
    fi
  done
}

stop_managed_containers() {
  local uid="$1"
  run_user_systemctl "${uid}" stop \
    krav-kong.service \
    krav-hsa-person-lookup-adapter.service \
    krav-hsa-directory-mock.service \
    krav-db.service \
    krav-idp.service \
    krav-hsa-mtls-cert-generator.service \
    krav-support-network.service || true

  run_user_podman "${uid}" rm --force \
    kong \
    hsa-person-lookup-adapter \
    hsa-directory-mock \
    db \
    idp \
    hsa-mtls-cert-generator >/dev/null 2>&1 || true

  run_user_podman "${uid}" network rm --force krav-support >/dev/null 2>&1 || true
}

start_user_quadlets() {
  local uid
  uid="$(id -u "${VSCODE_USER}")"
  loginctl enable-linger "${VSCODE_USER}"
  systemctl start "user@${uid}.service" || true

  configure_user_systemd_environment "${uid}"
  prepare_user_podman_runtime "${uid}"
  run_user_systemctl "${uid}" daemon-reload

  stop_managed_containers "${uid}"

  run_user_systemctl "${uid}" reset-failed \
      krav-support-network.service \
      krav-sqlserver-volume.service \
      krav-hsa-mtls-certs-volume.service \
      krav-hsa-mtls-cert-generator.service \
      krav-hsa-directory-mock.service \
      krav-hsa-person-lookup-adapter.service \
      krav-db.service \
      krav-idp.service \
      krav-kong.service || true

  run_user_systemctl_or_diagnose "${uid}" "restart base Quadlet resources" restart \
      krav-support-network.service \
      krav-sqlserver-volume.service \
      krav-hsa-mtls-certs-volume.service
  ensure_base_podman_resources "${uid}"

  run_user_systemctl_or_diagnose "${uid}" "generate HSA mTLS certificates" restart \
      krav-hsa-mtls-cert-generator.service

  run_user_systemctl_or_diagnose "${uid}" "start database service" start \
      krav-db.service

  run_user_systemctl_or_diagnose "${uid}" "start identity service" start \
      krav-idp.service

  run_user_systemctl_or_diagnose "${uid}" "start HSA directory mock service" restart \
      krav-hsa-directory-mock.service

  run_user_systemctl_or_diagnose "${uid}" "start HSA person lookup adapter service" restart \
      krav-hsa-person-lookup-adapter.service

  run_user_systemctl_or_diagnose "${uid}" "start Kong proxy service" restart \
      krav-kong.service
}

install_optional_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    return
  fi
  bash "${APT_KEY_VERIFIER}" \
    'Tailscale' \
    'https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg' \
    '/usr/share/keyrings/tailscale-archive-keyring.gpg' \
    '2596A99EAAB33821893C0A79458CA832957F5868'
  printf \
    'deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu noble main\n' \
    > /etc/apt/sources.list.d/tailscale.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    tailscale
  if [ -f /etc/krav-dev/tailscale.env ]; then
    set -a
    # shellcheck disable=SC1091
    . /etc/krav-dev/tailscale.env
    set +a
    if [ -n "${AZURE_DEV_TAILSCALE_AUTH_KEY:-}" ]; then
      tailscale up \
        --auth-key="${AZURE_DEV_TAILSCALE_AUTH_KEY}" \
        --hostname="$(hostname)-krav-dev" \
        --ssh=false
    fi
  fi
}

dump_support_stack_diagnostics() {
  local uid
  uid="$(id -u "${VSCODE_USER}")"

  log "support stack diagnostics"
  ss -ltn || true
  printf '\n[krav-azure-bootstrap] user systemd environment\n'
  run_user_systemctl "${uid}" show-environment || true
  run_user_systemctl "${uid}" --no-pager --failed || true

  local units=(
    krav-support-network.service
    krav-sqlserver-volume.service
    krav-hsa-mtls-certs-volume.service
    krav-hsa-mtls-cert-generator.service
    krav-db.service
    krav-idp.service
    krav-hsa-directory-mock.service
    krav-hsa-person-lookup-adapter.service
    krav-kong.service
  )
  for unit in "${units[@]}"; do
    printf '\n[krav-azure-bootstrap] systemd status for %s\n' "${unit}"
    run_user_systemctl "${uid}" status "${unit}" --no-pager || true
    printf '\n[krav-azure-bootstrap] systemd environment for %s\n' "${unit}"
    run_user_systemctl "${uid}" show "${unit}" -p Environment --no-pager || true
    printf '\n[krav-azure-bootstrap] journal for %s\n' "${unit}"
    runuser -u "${VSCODE_USER}" -- env \
      XDG_RUNTIME_DIR="/run/user/${uid}" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" \
      journalctl --user -u "${unit}" -n 80 --no-pager || true
  done

  printf '\n[krav-azure-bootstrap] podman containers\n'
  run_user_podman "${uid}" ps -a || true
  printf '\n[krav-azure-bootstrap] podman store\n'
  run_user_podman "${uid}" info --format 'GraphRoot={{.Store.GraphRoot}} RunRoot={{.Store.RunRoot}}' || true
  printf '\n[krav-azure-bootstrap] podman networks\n'
  run_user_podman "${uid}" network ls || true
  printf '\n[krav-azure-bootstrap] podman volumes\n'
  run_user_podman "${uid}" volume ls || true

  local containers=(
    db
    idp
    hsa-mtls-cert-generator
    hsa-directory-mock
    hsa-person-lookup-adapter
    kong
  )
  for container in "${containers[@]}"; do
    printf '\n[krav-azure-bootstrap] podman logs for %s\n' "${container}"
    run_user_podman "${uid}" logs --tail 100 "${container}" || true
  done
}

validate_loopback_ports() {
  for _ in $(seq 1 90); do
    if ss -ltn | grep '127.0.0.1:1433' >/dev/null &&
      ss -ltn | grep '127.0.0.1:8080' >/dev/null &&
      ss -ltn | grep '127.0.0.1:18000' >/dev/null &&
      curl -s -o /dev/null http://127.0.0.1:18000/; then
      return
    fi
    sleep 5
  done
  log 'timed out waiting for support stack loopback ports'
  dump_support_stack_diagnostics
  return 1
}

main() {
  log "starting host bootstrap"
  install_host_packages
  install_lychee
  configure_optional_ubuntu_pro
  ensure_vscode_user
  configure_git_identity
  configure_ssh_access
  install_service_environment_files
  stop_user_quadlet_services_before_storage_change
  stop_docker_services_before_storage_change
  mount_data_disk
  start_docker_services_after_storage_change
  configure_npm_caches
  install_ai_tools
  configure_codex_sandbox
  configure_podman_storage
  clone_or_update_repo
  ensure_kong_route_protocols
  install_zsh_profile
  install_storage_tools
  configure_codex_home
  run_repository_setup
  write_vm_env_override
  install_quadlet_units
  build_hsa_images
  start_user_quadlets
  install_optional_tailscale
  validate_loopback_ports
  log "host bootstrap completed"
}

main "$@"
