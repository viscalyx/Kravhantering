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
SYSTEMD_USER_DIR="${VSCODE_HOME}/.config/containers/systemd"
KRAV_CONFIG_DIR="${VSCODE_HOME}/.config/krav-dev"
HOST_STATE_DIR="/var/lib/krav-azure-dev"
QUADLET_SOURCE_DIR="${AZURE_DEV_QUADLET_SOURCE:-${WORKSPACE_DIR}/scripts/azure-dev/templates/quadlet}"
SERVICE_ENV_SOURCE_DIR="${AZURE_DEV_SERVICE_ENV_SOURCE:-}"

log() {
  printf '[krav-azure-bootstrap] %s\n' "$*"
}

cleanup_service_environment_source() {
  if [ -z "${SERVICE_ENV_SOURCE_DIR}" ]; then
    return
  fi
  rm -f \
    "${SERVICE_ENV_SOURCE_DIR}/sqlserver.env" \
    "${SERVICE_ENV_SOURCE_DIR}/keycloak.env"
  rmdir "${SERVICE_ENV_SOURCE_DIR}" 2>/dev/null || true
}

trap cleanup_service_environment_source EXIT

run_as_vscode() {
  runuser -u "${VSCODE_USER}" -- env \
    HOME="${VSCODE_HOME}" \
    XDG_CONFIG_HOME="${VSCODE_HOME}/.config" \
    XDG_DATA_HOME="${VSCODE_HOME}/.local/share" \
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
  install -d -m 0755 /etc/sudoers.d
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${VSCODE_USER}" \
    > /etc/sudoers.d/90-krav-vscode
  chmod 0440 /etc/sudoers.d/90-krav-vscode
}

configure_repositories() {
  install -d -m 0755 /etc/apt/keyrings
  rm -f /tmp/packages-microsoft-prod.deb

  if [ ! -f /etc/apt/sources.list.d/nodesource.list ]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  fi

  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    printf \
      'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable\n' \
      "$(dpkg --print-architecture)" \
      > /etc/apt/sources.list.d/docker.list
  fi

  if [ ! -f /etc/apt/sources.list.d/github-cli.list ]; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    printf \
      'deb [arch=%s signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
      "$(dpkg --print-architecture)" \
      > /etc/apt/sources.list.d/github-cli.list
  fi
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
    build-essential \
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
    wget \
    zsh

  npm install --global npm@latest

  if ! command -v dotenv-linter >/dev/null 2>&1; then
    curl -sSfL https://raw.githubusercontent.com/dotenv-linter/dotenv-linter/master/install.sh \
      | sh -s -- -b /usr/local/bin
  fi
}

mount_data_disk() {
  install -d -m 0755 \
    "${DATA_MOUNT_DIR}" \
    "${WORKSPACE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${PODMAN_STORAGE_DIR}"
  if [ ! -e "${DATA_DEVICE}" ]; then
    log "Azure data disk not found at ${DATA_DEVICE}; cannot place ${WORKSPACE_DIR} and Podman storage on the data disk"
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
    '$1 == "UUID=" uuid { next }
     $2 == data_mount { next }
     $2 == workspace { next }
     $2 == host_state { next }
     $2 == podman_storage { next }
     { print }' \
    /etc/fstab > "${fstab_tmp}"
  cat "${fstab_tmp}" > /etc/fstab
  rm -f "${fstab_tmp}"
  printf 'UUID=%s %s %s defaults,nofail 0 2\n' \
    "${uuid}" \
    "${DATA_MOUNT_DIR}" \
    "${DATA_FSTYPE}" \
    >> /etc/fstab
  printf '%s %s none bind,nofail,x-systemd.requires-mounts-for=%s 0 0\n' \
    "${DATA_WORKSPACE_DIR}" \
    "${WORKSPACE_DIR}" \
    "${DATA_MOUNT_DIR}" \
    >> /etc/fstab
  printf '%s %s none bind,nofail,x-systemd.requires-mounts-for=%s 0 0\n' \
    "${DATA_HOST_STATE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${DATA_MOUNT_DIR}" \
    >> /etc/fstab
  printf '%s %s none bind,nofail,x-systemd.requires-mounts-for=%s 0 0\n' \
    "${DATA_PODMAN_STORAGE_DIR}" \
    "${PODMAN_STORAGE_DIR}" \
    "${DATA_MOUNT_DIR}" \
    >> /etc/fstab

  if ! findmnt "${DATA_MOUNT_DIR}" >/dev/null 2>&1; then
    mount "${DATA_MOUNT_DIR}"
  fi

  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" \
    "${DATA_WORKSPACE_DIR}" \
    "${DATA_HOST_STATE_DIR}" \
    "${DATA_PODMAN_STORAGE_DIR}" \
    "${PODMAN_STORAGE_DIR}"

  if ! findmnt "${WORKSPACE_DIR}" >/dev/null 2>&1; then
    mount "${WORKSPACE_DIR}"
  fi

  if ! findmnt "${HOST_STATE_DIR}" >/dev/null 2>&1; then
    mount "${HOST_STATE_DIR}"
  fi

  if ! findmnt "${PODMAN_STORAGE_DIR}" >/dev/null 2>&1; then
    mount "${PODMAN_STORAGE_DIR}"
  fi

  rm -rf \
    "${DATA_MOUNT_DIR}/lost+found" \
    "${HOST_STATE_DIR}/lost+found" \
    "${WORKSPACE_DIR}/lost+found" \
    "${PODMAN_STORAGE_DIR}/lost+found"
  chown "${VSCODE_USER}:${VSCODE_USER}" \
    "${DATA_WORKSPACE_DIR}" \
    "${DATA_HOST_STATE_DIR}" \
    "${DATA_PODMAN_STORAGE_DIR}" \
    "${WORKSPACE_DIR}" \
    "${HOST_STATE_DIR}" \
    "${PODMAN_STORAGE_DIR}"
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
    clone_dir="$(mktemp -d /tmp/krav-bootstrap-repo.XXXXXX)"
    chown "${VSCODE_USER}:${VSCODE_USER}" "${clone_dir}"
    run_as_vscode "git clone '${REPO_URL}' '${clone_dir}'"
    run_as_vscode "cd '${clone_dir}' && tar cf - . | tar -C '${WORKSPACE_DIR}' -xf -"
    rm -rf "${clone_dir}"
  fi
  git config --system --add safe.directory "${WORKSPACE_DIR}" || true
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
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh" ]; then
    run_as_vscode \
      "RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)\""
  fi

  run_as_vscode "mkdir -p '${VSCODE_HOME}/.oh-my-zsh/custom/plugins'"
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-autosuggestions" ]; then
    run_as_vscode \
      "git clone https://github.com/zsh-users/zsh-autosuggestions.git '${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-autosuggestions'"
  fi
  if [ ! -d "${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" ]; then
    run_as_vscode \
      "git clone https://github.com/zsh-users/zsh-syntax-highlighting.git '${VSCODE_HOME}/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting'"
  fi

  if ! grep -q 'zsh-autosuggestions' "${VSCODE_HOME}/.zshrc" 2>/dev/null; then
    cat >> "${VSCODE_HOME}/.zshrc" <<'EOF'
plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
EOF
  fi
  chown "${VSCODE_USER}:${VSCODE_USER}" "${VSCODE_HOME}/.zshrc"
}

configure_codex_home() {
  install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" \
    "${VSCODE_HOME}/.codex" \
    "${VSCODE_HOME}/.codex/sqlite" \
    "${VSCODE_HOME}/.codex/tmp"

  if [ ! -f "${VSCODE_HOME}/.codex/config.toml" ] &&
    [ -f "${WORKSPACE_DIR}/.devcontainer/codex-config.toml" ]; then
    install -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0644 \
      "${WORKSPACE_DIR}/.devcontainer/codex-config.toml" \
      "${VSCODE_HOME}/.codex/config.toml"
  fi
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
  run_as_vscode "cd '${WORKSPACE_DIR}' && npm install"
  run_as_vscode "cd '${WORKSPACE_DIR}' && dotnet tool restore"
  run_as_vscode "cd '${WORKSPACE_DIR}' && npx playwright install --with-deps"
  link_playwright_chrome
  run_as_vscode "cd '${WORKSPACE_DIR}' && bash .devcontainer/trust-container-ca.sh"
}

write_vm_env_override() {
  local file="${WORKSPACE_DIR}/.env.development.local"
  local start="# >>> kravhantering azure vm managed"
  local end="# <<< kravhantering azure vm managed"
  local tmp
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

build_hsa_images() {
  run_as_vscode \
    "cd '${WORKSPACE_DIR}' && podman build --tag localhost/kravhantering/hsa-person-lookup-adapter:local --file containers/hsa-person-lookup-adapter/Dockerfile containers/hsa-person-lookup-adapter"
  run_as_vscode \
    "cd '${WORKSPACE_DIR}' && podman build --tag localhost/kravhantering/hsa-directory-mock:local --file containers/hsa-directory-mock/Dockerfile containers/hsa-directory-mock"
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
  curl -fsSL https://tailscale.com/install.sh | sh
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
  ensure_vscode_user
  install_service_environment_files
  stop_user_quadlet_services_before_storage_change
  mount_data_disk
  configure_podman_storage
  clone_or_update_repo
  ensure_kong_route_protocols
  install_zsh_profile
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
