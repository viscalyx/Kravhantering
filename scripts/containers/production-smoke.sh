#!/usr/bin/env bash

set -euo pipefail

SERVICE_USER="${PRODUCTION_SMOKE_SERVICE_USER:-kravhantering}"
SERVICE_HOME="/home/$SERVICE_USER"
INSTALL_ROOT="${PRODUCTION_SMOKE_INSTALL_ROOT:-/opt/kravhantering}"
CONFIG_ROOT="${PRODUCTION_SMOKE_CONFIG_ROOT:-/etc/kravhantering}"
EVIDENCE_DIR="${PRODUCTION_SMOKE_EVIDENCE_DIR:-$PWD/tmp/production-smoke-evidence}"
HSA_INTEGRATION_LOCK_FILE="${PRODUCTION_SMOKE_HSA_INTEGRATION_LOCK_FILE:-$PWD/container-hsa-integration-support.lock.json}"
TOPOLOGY=single-node
CONFIG_TEMP_DIR=''
RECOVERY_TEMP_DIR=''

cleanup_config_temp() {
  if [[ -n "$CONFIG_TEMP_DIR" && -d "$CONFIG_TEMP_DIR" ]]; then
    rm -rf -- "$CONFIG_TEMP_DIR"
  fi
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    as_service podman rm --force kravhantering-ci-keycloak-recovery \
      kravhantering-ci-sqlserver-recovery >/dev/null 2>&1 || true
    as_service podman volume rm kravhantering-ci-keycloak-recovery \
      kravhantering-ci-sqlserver-recovery >/dev/null 2>&1 || true
  fi
  if [[ -n "$RECOVERY_TEMP_DIR" && -d "$RECOVERY_TEMP_DIR" ]]; then
    sudo rm -rf -- "$RECOVERY_TEMP_DIR"
  fi
}

trap cleanup_config_temp EXIT

fail() {
  printf 'production-smoke: %s\n' "$*" >&2
  exit 1
}

required_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name-}" ]] || fail "missing environment value: $name"
  done
}

service_uid() {
  id -u "$SERVICE_USER"
}

as_service() {
  local uid
  uid="$(service_uid)"
  (
    cd "$SERVICE_HOME"
    sudo -u "$SERVICE_USER" env \
      -u CONTAINERS_CONF \
      -u CONTAINERS_REGISTRIES_CONF \
      -u CONTAINERS_STORAGE_CONF \
      -u REGISTRY_AUTH_FILE \
      HOME="$SERVICE_HOME" \
      XDG_CACHE_HOME="$SERVICE_HOME/.cache" \
      XDG_CONFIG_HOME="$SERVICE_HOME/.config" \
      XDG_DATA_HOME="$SERVICE_HOME/.local/share" \
      XDG_RUNTIME_DIR="/run/user/$uid" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
      "$@"
  )
}

service_systemctl() {
  as_service systemctl --user "$@"
}

configure_ci_quadlet_search_path() {
  local uid
  local user_search_path
  local quadlet_dir="$SERVICE_HOME/.config/containers/systemd"
  uid="$(service_uid)"
  user_search_path="/etc/containers/systemd/users/$uid"
  sudo install -d -m 0755 /etc/containers/systemd/users
  if [[ -L "$user_search_path" ]]; then
    [[ "$(readlink "$user_search_path")" == "$quadlet_dir" ]] || \
      fail "unexpected Quadlet user search path: $user_search_path"
    return
  fi
  [[ ! -e "$user_search_path" ]] || \
    fail "Quadlet user search path already exists: $user_search_path"
  sudo ln -s "$quadlet_dir" "$user_search_path"
}

configure_service_systemd_environment() {
  local uid
  uid="$(service_uid)"
  service_systemctl set-environment \
    "HOME=$SERVICE_HOME" \
    "XDG_CACHE_HOME=$SERVICE_HOME/.cache" \
    "XDG_CONFIG_HOME=$SERVICE_HOME/.config" \
    "XDG_DATA_HOME=$SERVICE_HOME/.local/share" \
    "XDG_RUNTIME_DIR=/run/user/$uid"
}

assert_generated_quadlet_service() {
  local service="$1"
  local manager_environment
  if service_systemctl cat "$service" >/dev/null 2>&1; then
    return
  fi
  manager_environment="$(
    service_systemctl show-environment |
      grep -E '^(HOME|XDG_CONFIG_HOME)=' |
      paste -sd ' ' -
  )"
  fail "systemd did not generate $service (manager environment: $manager_environment)"
}

prepare_service_user() {
  local uid
  local minimum_free_kib=$(( 5 * 1024 * 1024 ))
  local available_kib graph_root storage_path
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    sudo useradd --create-home --shell /bin/bash "$SERVICE_USER"
  fi
  grep -Eq "^${SERVICE_USER}:[0-9]+:[0-9]+$" /etc/subuid || \
    fail "service user has no subordinate UID range: $SERVICE_USER"
  grep -Eq "^${SERVICE_USER}:[0-9]+:[0-9]+$" /etc/subgid || \
    fail "service user has no subordinate GID range: $SERVICE_USER"
  configure_ci_quadlet_search_path
  uid="$(service_uid)"
  sudo loginctl enable-linger "$SERVICE_USER"
  sudo systemctl start "user@${uid}.service"
  configure_service_systemd_environment
  graph_root="$(as_service podman info --format '{{.Store.GraphRoot}}')"
  as_service install -d -m 0700 "$graph_root"
  sudo install -d -m 0755 "$INSTALL_ROOT"
  for storage_path in "$PWD" "$INSTALL_ROOT" "$graph_root"; do
    available_kib="$(
      sudo df --output=avail -k "$storage_path" 2>/dev/null |
        tail -n 1 |
        tr -d ' '
    )" || \
      fail 'less than 5 GiB is available for the production smoke installation'
    if [[ ! "$available_kib" =~ ^[0-9]+$ ]] ||
      (( available_kib < minimum_free_kib )); then
      fail 'less than 5 GiB is available for the production smoke installation'
    fi
  done
  sudo install -d -m 0755 /etc/systemd/journald.conf.d
  printf '%s\n' \
    '[Journal]' \
    'SystemMaxUse=1G' \
    'SystemKeepFree=1G' |
    sudo tee /etc/systemd/journald.conf.d/kravhantering-ci.conf >/dev/null
  sudo systemctl restart systemd-journald
  as_service podman info --format '{{.Host.CgroupsVersion}} {{.Store.GraphDriverName}}' |
    grep -Eq '^v2 overlay$' || \
    fail 'production smoke requires cgroup v2 and rootless overlay storage'
}

install_archive() {
  local archive="$1" bundle_name release_root
  [[ -s "$archive" ]] || fail "deployment archive is missing: $archive"
  bundle_name="$(tar -tzf "$archive" | sed -n '1s#/.*##p')"
  [[ "$bundle_name" == kravhantering-production-deploy-* ]] || \
    fail "unexpected deployment archive root: $bundle_name"
  release_root="$INSTALL_ROOT/releases/$bundle_name"
  sudo install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0755 \
    "$INSTALL_ROOT/releases"
  sudo tar -xzf "$archive" -C "$INSTALL_ROOT/releases"
  sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$release_root"
  sudo ln -sfn "$release_root" "$INSTALL_ROOT/current"
}

render_runtime_configuration() {
  CONFIG_TEMP_DIR="$(mktemp -d)"
  cp containers/app/.env.app.local "$CONFIG_TEMP_DIR/app.env"
  sed -i \
    -e 's#/realms/kravhantering-test#/realms/kravhantering-production#' \
    -e 's#^HSA_PERSON_LOOKUP_URL=.*#HSA_PERSON_LOOKUP_URL=http://kong:8000/hsa/person-records/lookup#' \
    "$CONFIG_TEMP_DIR/app.env"
  cp containers/db-job/.env.db-job.local "$CONFIG_TEMP_DIR/db-job.env"
  cp containers/keycloak/.env.keycloak.local "$CONFIG_TEMP_DIR/keycloak.env"
  cp containers/sqlserver/.env.sqlserver.local "$CONFIG_TEMP_DIR/sqlserver.env"

  cp "$INSTALL_ROOT/current/keycloak/realm-kravhantering-production.template.json" \
    "$CONFIG_TEMP_DIR/realm.json"
  sed -i \
    -e 's#kravhantering.example.internal#kravhantering.test#g' \
    -e 's#replace-with-production-app-client-secret#container-demo-app-secret-not-for-production#g' \
    -e 's#replace-with-production-mcp-client-secret#container-demo-mcp-secret-not-for-production#g' \
    "$CONFIG_TEMP_DIR/realm.json"
  node "$INSTALL_ROOT/current/scripts/keycloak-demo-users.mjs" merge-file \
    --users "$INSTALL_ROOT/current/keycloak/demo-users.not-for-production.json" \
    --realm-file "$CONFIG_TEMP_DIR/realm.json" \
    --output "$CONFIG_TEMP_DIR/realm-with-demo-users.json"

  required_env APP_RUNTIME_IMAGE_REF DB_JOB_IMAGE_REF KEYCLOAK_IMAGE_REF \
    NGINX_IMAGE_REF SQLSERVER_IMAGE_REF
  {
    printf 'APP_RUNTIME_IMAGE_REF=%s\n' "$APP_RUNTIME_IMAGE_REF"
    printf 'DB_JOB_IMAGE_REF=%s\n' "$DB_JOB_IMAGE_REF"
    printf 'KEYCLOAK_IMAGE_REF=%s\n' "$KEYCLOAK_IMAGE_REF"
    printf 'NGINX_IMAGE_REF=%s\n' "$NGINX_IMAGE_REF"
    printf 'SQLSERVER_IMAGE_REF=%s\n' "$SQLSERVER_IMAGE_REF"
    printf 'PUBLIC_HOSTNAME=kravhantering.test\n'
    printf 'NGINX_HTTPS_BIND=443:443\n'
    printf 'NGINX_HTTP_BIND=127.0.0.1:8080\n'
    printf 'NGINX_RESOLVER=%s\n' "${NGINX_RESOLVER:-10.89.0.1}"
    printf 'NGINX_IDENTITY_RESOLVER=%s\n' \
      "${NGINX_IDENTITY_RESOLVER:-10.89.1.1}"
    printf 'APP_RUNTIME_MEMORY_LIMIT_MIB=4096\n'
    printf 'APP_RUNTIME_CPU_QUOTA_PERCENT=300\n'
    printf 'APP_RUNTIME_PIDS_LIMIT=512\n'
    printf 'APP_RUNTIME_EXPORT_STORAGE=tmpfs\n'
    printf 'APP_RUNTIME_EXPORT_TMPFS_MIB=1024\n'
    printf 'NGINX_MEMORY_LIMIT_MIB=512\n'
    printf 'NGINX_CPU_QUOTA_PERCENT=100\n'
    printf 'NGINX_PIDS_LIMIT=128\n'
    printf 'NGINX_CACHE_TMPFS_MIB=64\n'
    printf 'SQLSERVER_MEMORY_LIMIT_MIB=4096\n'
    printf 'SQLSERVER_CPU_QUOTA_PERCENT=200\n'
    printf 'SQLSERVER_PIDS_LIMIT=1024\n'
    printf 'SQLSERVER_TMPFS_MIB=512\n'
    printf 'KEYCLOAK_MEMORY_LIMIT_MIB=3072\n'
    printf 'KEYCLOAK_CPU_QUOTA_PERCENT=100\n'
    printf 'KEYCLOAK_PIDS_LIMIT=512\n'
    printf 'KEYCLOAK_QUARKUS_TMPFS_MIB=64\n'
    printf 'KEYCLOAK_TMPFS_MIB=512\n'
  } >"$CONFIG_TEMP_DIR/release.env"

  sudo install -d -o root -g "$SERVICE_USER" -m 0750 \
    "$CONFIG_ROOT" "$CONFIG_ROOT/keycloak" "$CONFIG_ROOT/tls"
  for file in app.env db-job.env keycloak.env release.env sqlserver.env; do
    sudo install -o root -g "$SERVICE_USER" -m 0640 \
      "$CONFIG_TEMP_DIR/$file" "$CONFIG_ROOT/$file"
  done
  sudo install -o root -g "$SERVICE_USER" -m 0640 \
    "$CONFIG_TEMP_DIR/realm-with-demo-users.json" \
    "$CONFIG_ROOT/keycloak/realm-kravhantering-production.json"
  sudo install -o root -g "$SERVICE_USER" -m 0640 \
    tmp/container-tls/kravhantering.test.crt "$CONFIG_ROOT/tls/fullchain.pem"
  sudo install -o root -g "$SERVICE_USER" -m 0640 \
    tmp/container-tls/kravhantering.test.key "$CONFIG_ROOT/tls/privkey.pem"
  sudo install -o root -g "$SERVICE_USER" -m 0644 \
    tmp/container-tls/ca.crt "$CONFIG_ROOT/tls/ca.crt"
  rm -rf -- "$CONFIG_TEMP_DIR"
  CONFIG_TEMP_DIR=''
}

load_project_image() {
  local reference="$1" archive="${2-}"
  if [[ -n "$archive" ]]; then
    [[ -s "$archive" ]] || fail "OCI archive is missing: $archive"
    as_service podman load <"$archive"
  else
    docker image inspect "$reference" >/dev/null
    docker save "$reference" | as_service podman load
  fi
  as_service podman image exists "$reference" || \
    fail "loaded image does not provide expected reference: $reference"
}

verify_project_image_id() {
  local reference="$1" expected="$2" actual
  actual="$(as_service podman image inspect "$reference" --format '{{.Id}}')"
  [[ "${actual#sha256:}" == "${expected#sha256:}" ]] || \
    fail "loaded image ID for $reference does not match the candidate"
}

prepare_images() {
  local kong_image_id
  load_project_image "$APP_RUNTIME_IMAGE_REF" "${APP_RUNTIME_OCI_ARCHIVE-}"
  load_project_image "$DB_JOB_IMAGE_REF" "${DB_JOB_OCI_ARCHIVE-}"
  load_project_image "$DEMO_SEED_IMAGE_REF" "${DEMO_SEED_OCI_ARCHIVE-}"
  load_project_image "$HSA_DIRECTORY_MOCK_IMAGE_REF" \
    "${HSA_DIRECTORY_MOCK_OCI_ARCHIVE-}"
  load_project_image "$HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF" \
    "${HSA_PERSON_LOOKUP_ADAPTER_OCI_ARCHIVE-}"
  as_service podman pull "$NGINX_IMAGE_REF"
  as_service podman pull "$SQLSERVER_IMAGE_REF"
  as_service podman pull "$KEYCLOAK_IMAGE_REF"
  as_service podman pull "$KONG_IMAGE_REF"
  verify_project_image_id "$APP_RUNTIME_IMAGE_REF" "$APP_RUNTIME_IMAGE_ID"
  verify_project_image_id "$DB_JOB_IMAGE_REF" "$DB_JOB_IMAGE_ID"
  verify_project_image_id "$DEMO_SEED_IMAGE_REF" "$DEMO_SEED_IMAGE_ID"
  verify_project_image_id \
    "$HSA_DIRECTORY_MOCK_IMAGE_REF" "$HSA_DIRECTORY_MOCK_IMAGE_ID"
  verify_project_image_id \
    "$HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF" \
    "$HSA_PERSON_LOOKUP_ADAPTER_IMAGE_ID"
  kong_image_id="$(jq -r \
    '.services[] | select(.name == "kong") | .imageId' \
    "$HSA_INTEGRATION_LOCK_FILE")"
  [[ "$kong_image_id" != null && -n "$kong_image_id" ]] || \
    fail 'HSA integration support lock has no Kong image ID'
  verify_project_image_id "$KONG_IMAGE_REF" "$kong_image_id"
  as_service "$INSTALL_ROOT/current/bin/kravhantering-images.sh" \
    --topology single-node \
    --lock-file "$INSTALL_ROOT/current/container-stack.lock.json" \
    --env-file "$CONFIG_ROOT/release.env" \
    verify
}

render_ci_overlay() {
  local quadlet_dir systemd_dir template output
  quadlet_dir="$SERVICE_HOME/.config/containers/systemd"
  systemd_dir="$SERVICE_HOME/.config/systemd/user"
  as_service mkdir -p "$quadlet_dir" "$systemd_dir"
  for template in .github/production-smoke/quadlet/*.template; do
    output="$(basename "${template%.template}")"
    if [[ "$output" == *.target ]]; then
      output="$systemd_dir/$output"
    else
      output="$quadlet_dir/$output"
    fi
    sed \
      -e "s#@@BUNDLE_ROOT@@#$INSTALL_ROOT/current#g" \
      -e "s#@@HSA_DIRECTORY_MOCK_IMAGE_REF@@#$HSA_DIRECTORY_MOCK_IMAGE_REF#g" \
      -e "s#@@HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF@@#$HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF#g" \
      -e "s#@@KONG_IMAGE_REF@@#$KONG_IMAGE_REF#g" \
      "$template" | as_service tee "$output" >/dev/null
  done
}

database_job() {
  local command="$1" network
  network="$(as_service "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" \
    print-network --topology single-node --purpose database)"
  as_service podman run --rm --pull=never --network "$network" \
    --env-file "$CONFIG_ROOT/db-job.env" "$DB_JOB_IMAGE_REF" "$command"
}

stack_services_are_progressing() {
  local service state
  for service in kravhantering-app-runtime.service \
    kravhantering-keycloak.service kravhantering-nginx.service \
    kravhantering-sqlserver.service; do
    state="$(service_systemctl is-active "$service" 2>/dev/null || true)"
    case "$state" in
      active | activating | reloading) ;;
      *) return 1 ;;
    esac
  done
}

configure_nginx_resolvers() {
  local helper="$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh"
  local edge_resolver identity_resolver
  service_systemctl start \
    kravhantering-single-node-edge-network.service
  edge_resolver="$(as_service "$helper" print-resolver \
    --topology single-node --purpose edge)"
  identity_resolver="$(as_service "$helper" print-resolver \
    --topology single-node --purpose identity)"
  sudo sed -i \
    -e "s#^NGINX_RESOLVER=.*#NGINX_RESOLVER=${edge_resolver}#" \
    -e "s#^NGINX_IDENTITY_RESOLVER=.*#NGINX_IDENTITY_RESOLVER=${identity_resolver}#" \
    "$CONFIG_ROOT/release.env"
  as_service "$helper" install --topology "$TOPOLOGY"
  service_systemctl daemon-reload
}

wait_for_url() {
  local url="$1" attempts=0 target_state
  until curl --fail --silent --show-error \
    --connect-timeout 2 --max-time 5 \
    --cacert tmp/container-tls/ca.crt "$url" >/dev/null; do
    target_state="$(service_systemctl is-active \
      kravhantering-single-node.target 2>/dev/null || true)"
    case "$target_state" in
      active | activating | reloading) ;;
      inactive)
        stack_services_are_progressing ||
          report_target_failure \
            "single-node target entered $target_state while waiting for $url"
        ;;
      *)
        report_target_failure \
          "single-node target entered $target_state while waiting for $url"
        ;;
    esac
    attempts="$(( attempts + 1 ))"
    (( attempts < 90 )) || fail "timed out waiting for $url"
    sleep 2
  done
  [[ "$(service_systemctl is-active \
    kravhantering-single-node.target 2>/dev/null || true)" == active ]] ||
    report_target_failure \
      "single-node target was not active after $url became ready"
}

report_target_failure() {
  local message="$1" unit
  service_systemctl list-units 'kravhantering-*' --state=failed --no-pager \
    >&2 || true
  for unit in kravhantering-app-runtime.service \
    kravhantering-keycloak.service kravhantering-nginx.service \
    kravhantering-sqlserver.service; do
    if ! service_systemctl is-active --quiet "$unit"; then
      service_systemctl status "$unit" --no-pager >&2 || true
    fi
  done
  fail "$message"
}

verify_service_cgroup() {
  local service="$1" expected_memory="$2" expected_tasks="$3"
  local expected_cpu="$4" control_group cgroup_root
  control_group="$(service_systemctl show "$service" \
    --property=ControlGroup --value)"
  cgroup_root="/sys/fs/cgroup${control_group}"
  [[ "$(<"$cgroup_root/memory.max")" == "$expected_memory" ]]
  [[ "$(<"$cgroup_root/pids.max")" == "$expected_tasks" ]]
  [[ "$(<"$cgroup_root/cpu.max")" == "$expected_cpu" ]]
}

container_networks() {
  local name="$1"
  as_service podman inspect "$name" \
    --format '{{range $network, $_ := .NetworkSettings.Networks}}{{println $network}}{{end}}' |
    sed '/^$/d' |
    sort
}

verify_network_contract() {
  local helper="$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh"
  local purpose network expected_internal actual_internal host_gateway_ip
  local public_hostname_ips
  for purpose in edge identity database egress; do
    network="$(as_service "$helper" print-network \
      --topology single-node --purpose "$purpose")"
    expected_internal=true
    [[ "$purpose" == egress ]] && expected_internal=false
    actual_internal="$(as_service podman network inspect "$network" \
      --format '{{.Internal}}')"
    [[ "$actual_internal" == "$expected_internal" ]]
  done

  [[ "$(container_networks kravhantering-nginx)" == \
    $'kravhantering-single-node_edge\nkravhantering-single-node_identity' ]]
  [[ "$(container_networks kravhantering-app-runtime)" == \
    $'kravhantering-single-node_database\nkravhantering-single-node_edge\nkravhantering-single-node_egress' ]]
  [[ "$(container_networks kravhantering-keycloak)" == \
    'kravhantering-single-node_identity' ]]
  [[ "$(container_networks kravhantering-sqlserver)" == \
    'kravhantering-single-node_database' ]]

  if as_service podman exec kravhantering-nginx getent hosts sqlserver; then
    fail 'nginx unexpectedly resolves the database peer'
  fi
  if as_service podman exec kravhantering-app-runtime getent hosts keycloak; then
    fail 'app-runtime unexpectedly resolves the direct identity peer'
  fi
  host_gateway_ip="$(as_service podman exec kravhantering-app-runtime \
    getent ahostsv4 host.containers.internal | awk 'NR == 1 { print $1 }')"
  public_hostname_ips="$(as_service podman exec kravhantering-app-runtime \
    getent ahostsv4 kravhantering.test | awk '{ print $1 }' | sort -u)"
  [[ -n "$host_gateway_ip" ]] && \
    grep -Fqx "$host_gateway_ip" <<<"$public_hostname_ips" || \
    fail 'the public OIDC hostname does not resolve through the host-published nginx route'
  if as_service podman exec kravhantering-nginx \
    wget -T 2 -qO /dev/null http://1.1.1.1; then
    fail 'nginx unexpectedly reached an external address from internal networks'
  fi
}

verify_containment() {
  local bounding_caps containment_contract effective_caps
  local expected_effective_cap name
  for containment_contract in \
    kravhantering-app-runtime:none \
    kravhantering-keycloak:none \
    kravhantering-nginx:none \
    kravhantering-sqlserver:NET_BIND_SERVICE; do
    name="${containment_contract%%:*}"
    expected_effective_cap="${containment_contract#*:}"
    as_service podman inspect "$name" |
      jq -e '.[0].HostConfig.ReadonlyRootfs == true and
        any(.[0].HostConfig.SecurityOpt[]; startswith("no-new-privileges")) and
        .[0].HostConfig.PidsLimit > 0 and
        .[0].HostConfig.LogConfig.Type == "journald"' >/dev/null ||
      fail "$name inspect did not prove its containment contract"
    effective_caps="$(as_service podman top "$name" capeff | tail -n +2)"
    if [[ -z "$effective_caps" ]] ||
      grep -Fvxq "$expected_effective_cap" <<<"$effective_caps"; then
      fail "$name effective capabilities did not match $expected_effective_cap: $effective_caps"
    fi
    bounding_caps="$(as_service podman top "$name" capbnd | tail -n +2)"
    if [[ -z "$bounding_caps" ]] ||
      grep -Fvxq "$expected_effective_cap" <<<"$bounding_caps"; then
      fail "$name capability bounding set did not match $expected_effective_cap: $bounding_caps"
    fi
  done
  as_service podman inspect kravhantering-app-runtime |
    jq -e '([(
        .[0].Mounts[]? | select(.RW) | .Destination
      ), (.[0].HostConfig.Tmpfs // {} | keys[])] | sort) ==
      ["/run/kravhantering/export", "/tmp"]' >/dev/null ||
    fail 'app-runtime writable mount allow-list did not match the contract'
  as_service podman inspect kravhantering-nginx |
    jq -e '([(
        .[0].Mounts[]? | select(.RW) | .Destination
      ), (.[0].HostConfig.Tmpfs // {} | keys[])] | sort) ==
      ["/etc/nginx/conf.d", "/run", "/var/cache/nginx"]' >/dev/null ||
    fail 'nginx writable mount allow-list did not match the contract'
  as_service podman inspect kravhantering-keycloak |
    jq -e '([(
        .[0].Mounts[]? | select(.RW) | .Destination
      ), (.[0].HostConfig.Tmpfs // {} | keys[])] | sort) ==
      ["/opt/keycloak/data", "/opt/keycloak/lib/quarkus", "/tmp"]' \
      >/dev/null ||
    fail 'Keycloak writable mount allow-list did not match the contract'
  as_service podman inspect kravhantering-sqlserver |
    jq -e '([(
        .[0].Mounts[]? | select(.RW) | .Destination
      ), (.[0].HostConfig.Tmpfs // {} | keys[])] | sort) ==
      ["/tmp", "/var/opt/mssql"]' >/dev/null ||
    fail 'SQL Server writable mount allow-list did not match the contract'
  as_service podman inspect kravhantering-nginx |
    jq -e '.[0].NetworkSettings.Ports as $ports |
      ([$ports | to_entries[] | select(.value != null) | .key]) ==
        ["8443/tcp"] and
      all($ports["8443/tcp"][]; .HostPort == "443")' >/dev/null ||
    fail 'nginx published-port allow-list did not match the contract'
  for name in kravhantering-app-runtime kravhantering-keycloak \
    kravhantering-sqlserver; do
    as_service podman inspect "$name" |
      jq -e 'all(
        (.[0].NetworkSettings.Ports // {}) | to_entries[];
        .value == null
      )' >/dev/null ||
      fail "$name unexpectedly published a host port"
  done
  as_service podman exec kravhantering-app-runtime \
    sh -c 'touch /tmp/allowed && rm /tmp/allowed'
  if as_service podman exec kravhantering-app-runtime \
    sh -c 'touch /app/containment-must-fail'; then
    fail 'application read-only root probe unexpectedly succeeded'
  fi
  for name in kravhantering-keycloak kravhantering-sqlserver; do
    as_service podman exec "$name" sh -c \
      'touch /tmp/containment-allowed && rm /tmp/containment-allowed'
    if as_service podman exec "$name" sh -c \
      'touch /containment-must-fail'; then
      fail "$name read-only root probe unexpectedly succeeded"
    fi
  done
  verify_network_contract
  assert_service_property kravhantering-app-runtime.service MemoryMax 4294967296
  assert_service_property kravhantering-app-runtime.service TasksMax 544
  assert_service_property kravhantering-nginx.service MemoryMax 536870912
  assert_service_property kravhantering-nginx.service TasksMax 160
  assert_service_property kravhantering-keycloak.service MemoryMax 3221225472
  assert_service_property kravhantering-keycloak.service TasksMax 544
  assert_service_property kravhantering-sqlserver.service MemoryMax 4294967296
  assert_service_property kravhantering-sqlserver.service TasksMax 1056
  verify_service_cgroup kravhantering-app-runtime.service \
    4294967296 544 '300000 100000'
  verify_service_cgroup kravhantering-nginx.service \
    536870912 160 '100000 100000'
  verify_service_cgroup kravhantering-keycloak.service \
    3221225472 544 '100000 100000'
  verify_service_cgroup kravhantering-sqlserver.service \
    4294967296 1056 '200000 100000'
  as_service podman exec kravhantering-app-runtime sh -ec '
    i=1
    while [ "$i" -le 5 ]; do
      dd if=/dev/zero of="/run/kravhantering/export/csv-$i" bs=1M count=100 status=none &
      i=$((i + 1))
    done
    i=1
    while [ "$i" -le 3 ]; do
      dd if=/dev/zero of="/run/kravhantering/export/pdf-$i" bs=1M count=50 status=none &
      i=$((i + 1))
    done
    wait
    rm -f /run/kravhantering/export/csv-* /run/kravhantering/export/pdf-*
  '
}

sqlserver_query() {
  local container="$1" query="$2"
  as_service podman exec "$container" sh -c \
    '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -Q "$1"' \
    sh "$query"
}

wait_for_sqlserver_container() {
  local container="$1" attempts=0 container_state
  until sqlserver_query "$container" 'SELECT 1' >/dev/null 2>&1; do
    attempts="$(( attempts + 1 ))"
    if (( attempts >= 60 )); then
      container_state="$(as_service podman container inspect \
        --format '{{.State.Status}} (exit {{.State.ExitCode}})' \
        "$container" 2>/dev/null || printf 'unavailable')"
      as_service podman logs "$container" >&2 || true
      fail "timed out waiting for $container; state: $container_state"
    fi
    sleep 2
  done
}

verify_sqlserver_backup_recovery() {
  local backup_file database_name database_network result
  database_name="$(as_service sed -n 's/^DB_NAME=//p' \
    "$CONFIG_ROOT/db-job.env")"
  [[ "$database_name" =~ ^[A-Za-z0-9_]+$ ]] || \
    fail 'production smoke database name is unsafe for backup recovery'
  backup_file="${database_name}-containment-smoke.bak"
  RECOVERY_TEMP_DIR="$(mktemp -d)"
  sudo chown "$SERVICE_USER:$SERVICE_USER" "$RECOVERY_TEMP_DIR"

  as_service podman exec kravhantering-sqlserver \
    mkdir -p /var/opt/mssql/backups
  sqlserver_query kravhantering-sqlserver \
    "BACKUP DATABASE [$database_name] TO DISK = N'/var/opt/mssql/backups/$backup_file' WITH INIT, COPY_ONLY"
  as_service podman cp \
    "kravhantering-sqlserver:/var/opt/mssql/backups/$backup_file" \
    "$RECOVERY_TEMP_DIR/$backup_file"
  as_service podman volume create kravhantering-ci-sqlserver-recovery \
    >/dev/null
  database_network="$(as_service \
    "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" print-network \
    --topology single-node --purpose database)"
  as_service podman run --detach \
    --name kravhantering-ci-sqlserver-recovery \
    --network "$database_network" \
    --network-alias sqlserver-recovery \
    --env-file "$CONFIG_ROOT/sqlserver.env" \
    --cap-drop all \
    --cap-add NET_BIND_SERVICE \
    --security-opt no-new-privileges \
    --read-only \
    --pids-limit 1024 \
    --memory 4096m \
    --cpus 2 \
    --restart on-failure:1 \
    --log-driver journald \
    --volume kravhantering-ci-sqlserver-recovery:/var/opt/mssql:U \
    --tmpfs /tmp:rw,size=512m,mode=1777,nosuid,nodev,noexec \
    "$SQLSERVER_IMAGE_REF" >/dev/null
  wait_for_sqlserver_container kravhantering-ci-sqlserver-recovery
  as_service podman exec kravhantering-ci-sqlserver-recovery \
    mkdir -p /var/opt/mssql/backups
  as_service podman cp "$RECOVERY_TEMP_DIR/$backup_file" \
    "kravhantering-ci-sqlserver-recovery:/var/opt/mssql/backups/$backup_file"
  sqlserver_query kravhantering-ci-sqlserver-recovery \
    "RESTORE DATABASE [$database_name] FROM DISK = N'/var/opt/mssql/backups/$backup_file' WITH RECOVERY"
  result="$(sqlserver_query kravhantering-ci-sqlserver-recovery \
    "SET NOCOUNT ON; SELECT state_desc FROM sys.databases WHERE name = N'$database_name'; USE [$database_name]; SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES")"
  grep -Fq ONLINE <<<"$result" || \
    fail 'isolated SQL Server recovery database is not online'
  printf '%s\n' "$result" >"$EVIDENCE_DIR/sqlserver-recovery.txt"
}

verify_keycloak_backup_recovery() {
  local admin_password admin_response admin_token admin_user attempts=0
  local identity_network token_response
  RECOVERY_TEMP_DIR="${RECOVERY_TEMP_DIR:-$(mktemp -d)}"
  sudo chown "$SERVICE_USER:$SERVICE_USER" "$RECOVERY_TEMP_DIR"
  service_systemctl stop kravhantering-single-node.target
  as_service podman volume export --output \
    "$RECOVERY_TEMP_DIR/keycloak-data.tar" kravhantering-keycloak-data
  service_systemctl start kravhantering-single-node.target
  wait_for_url \
    https://kravhantering.test/auth/realms/kravhantering-production/.well-known/openid-configuration

  as_service podman volume create kravhantering-ci-keycloak-recovery >/dev/null
  as_service podman volume import kravhantering-ci-keycloak-recovery \
    "$RECOVERY_TEMP_DIR/keycloak-data.tar"
  identity_network="$(as_service \
    "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" print-network \
    --topology single-node --purpose identity)"
  as_service podman run --detach \
    --name kravhantering-ci-keycloak-recovery \
    --network "$identity_network" \
    --network-alias keycloak-recovery \
    --env-file "$CONFIG_ROOT/keycloak.env" \
    --cap-drop all \
    --security-opt no-new-privileges \
    --read-only \
    --pids-limit 512 \
    --memory 3072m \
    --cpus 1 \
    --log-driver journald \
    --volume kravhantering-ci-keycloak-recovery:/opt/keycloak/data:U \
    --tmpfs /opt/keycloak/lib/quarkus:rw,size=64m,mode=0755,U,nosuid,nodev,noexec \
    --tmpfs /tmp:rw,size=512m,mode=1777,nosuid,nodev,noexec \
    "$KEYCLOAK_IMAGE_REF" start >/dev/null
  until as_service podman exec kravhantering-nginx wget -qO - \
    http://keycloak-recovery:8080/realms/kravhantering-production/.well-known/openid-configuration \
    >"$EVIDENCE_DIR/keycloak-recovery-openid.json"; do
    attempts="$(( attempts + 1 ))"
    (( attempts < 60 )) || fail 'timed out waiting for recovered Keycloak realm'
    sleep 2
  done
  jq -e '.issuer | endswith("/auth/realms/kravhantering-production")' \
    "$EVIDENCE_DIR/keycloak-recovery-openid.json" >/dev/null || \
    fail 'isolated Keycloak recovery did not expose the saved realm'

  admin_user="$(as_service sed -n 's/^KEYCLOAK_ADMIN=//p' \
    "$CONFIG_ROOT/keycloak.env")"
  admin_password="$(as_service sed -n 's/^KEYCLOAK_ADMIN_PASSWORD=//p' \
    "$CONFIG_ROOT/keycloak.env")"
  [[ -n "$admin_user" && -n "$admin_password" ]] || \
    fail 'Keycloak recovery admin credentials are unavailable'
  admin_user="$(jq -rn --arg value "$admin_user" '$value | @uri')"
  admin_password="$(jq -rn --arg value "$admin_password" '$value | @uri')"
  token_response="$(as_service podman exec kravhantering-nginx wget -qO - \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --post-data \
    "client_id=admin-cli&username=${admin_user}&password=${admin_password}&grant_type=password" \
    http://keycloak-recovery:8080/realms/master/protocol/openid-connect/token)"
  admin_token="$(jq -er '.access_token' <<<"$token_response")" || \
    fail 'recovered Keycloak administrator authentication failed'
  admin_response="$(as_service podman exec kravhantering-nginx wget -qO - \
    --header "Authorization: Bearer $admin_token" \
    http://keycloak-recovery:8080/admin/realms/kravhantering-production)"
  jq -e '.realm == "kravhantering-production" and .enabled == true' \
    <<<"$admin_response" >/dev/null || \
    fail 'recovered Keycloak administrator could not read the saved realm'
  printf '%s\n' \
    'administrator-authentication=passed' \
    'realm-administration-read=passed' \
    >"$EVIDENCE_DIR/keycloak-recovery-admin.txt"
}

verify_backup_recovery() {
  verify_sqlserver_backup_recovery
  verify_keycloak_backup_recovery
  printf '%s\n' \
    'sqlserver-isolated-backup-recovery=passed' \
    'keycloak-isolated-backup-recovery=passed' \
    >"$EVIDENCE_DIR/backup-recovery.txt"
  cleanup_config_temp
  RECOVERY_TEMP_DIR=''
}

assert_service_property() {
  local service="$1" property="$2" expected="$3" observed
  observed="$(service_systemctl show "$service" \
    --property="$property" --value)"
  [[ "$observed" == "$expected" ]] || \
    fail "$service $property expected $expected (observed: $observed)"
}

up() {
  local archive="$1"
  required_env DEMO_SEED_IMAGE_REF HSA_DIRECTORY_MOCK_IMAGE_REF \
    HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF KONG_IMAGE_REF \
    APP_RUNTIME_IMAGE_ID DB_JOB_IMAGE_ID DEMO_SEED_IMAGE_ID \
    HSA_DIRECTORY_MOCK_IMAGE_ID HSA_PERSON_LOOKUP_ADAPTER_IMAGE_ID
  prepare_service_user
  install_archive "$archive"
  render_runtime_configuration
  prepare_images
  as_service "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" \
    install --topology "$TOPOLOGY"
  render_ci_overlay
  service_systemctl daemon-reload
  assert_generated_quadlet_service kravhantering-sqlserver.service
  mkdir -p "$EVIDENCE_DIR"
  service_systemctl start kravhantering-sqlserver.service
  service_systemctl start kravhantering-keycloak.service
  configure_nginx_resolvers
  database_job wait
  database_job bootstrap
  database_job migration-status >"$EVIDENCE_DIR/migration-before.json"
  database_job migrate >"$EVIDENCE_DIR/migration.json"
  database_job migration-status >"$EVIDENCE_DIR/migration-after.json"
  database_job permission-status >"$EVIDENCE_DIR/permissions.json"
  database_job seed:required
  local database_network
  database_network="$(as_service "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" \
    print-network --topology single-node --purpose database)"
  as_service podman run --rm --pull=never --network "$database_network" \
    --env-file "$CONFIG_ROOT/db-job.env" "$DEMO_SEED_IMAGE_REF"
  service_systemctl start kravhantering-ci-hsa.target
  service_systemctl enable kravhantering-single-node.target
  service_systemctl start kravhantering-single-node.target || \
    report_target_failure 'single-node target failed to start'
  wait_for_url https://kravhantering.test/api/health
  wait_for_url https://kravhantering.test/api/ready
  verify_containment
  service_systemctl restart kravhantering-app-runtime.service
  wait_for_url https://kravhantering.test/api/ready
  service_systemctl restart kravhantering-sqlserver.service
  database_job wait
  wait_for_url https://kravhantering.test/api/ready
  service_systemctl restart kravhantering-single-node.target
  wait_for_url \
    https://kravhantering.test/auth/realms/kravhantering-production/.well-known/openid-configuration
  wait_for_url https://kravhantering.test/api/ready
  as_service "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" \
    install --topology "$TOPOLOGY"
  service_systemctl daemon-reload
  service_systemctl stop kravhantering-single-node.target
  if service_systemctl is-active --quiet kravhantering-single-node.target; then
    fail 'single-node target remained active after stop'
  fi
  service_systemctl start kravhantering-single-node.target
  wait_for_url https://kravhantering.test/api/ready
  database_job migrate >"$EVIDENCE_DIR/migration-after-reinstall.json"
  database_job migration-status \
    >"$EVIDENCE_DIR/migration-status-after-reinstall.json"
  verify_backup_recovery
  printf '%s\n' \
    'app-runtime-restart=passed' \
    'sqlserver-restart-and-persistence=passed' \
    'keycloak-restart-and-persistence=passed' \
    'containment-upgrade-reinstall=passed' \
    'post-reinstall-migration=passed' \
    'target-stop-start=passed' >"$EVIDENCE_DIR/lifecycle.txt"
}

evidence() {
  mkdir -p "$EVIDENCE_DIR"
  for file in DEPLOYMENT-MANIFEST.json container-stack.lock.json \
    release-metadata.json; do
    if [[ -f "$INSTALL_ROOT/current/$file" ]]; then
      cp "$INSTALL_ROOT/current/$file" "$EVIDENCE_DIR/$file"
    fi
  done
  service_systemctl status kravhantering-single-node.target --no-pager \
    >"$EVIDENCE_DIR/systemd-status.txt" 2>&1 || true
  service_systemctl list-units 'kravhantering-*' --all --no-pager \
    >"$EVIDENCE_DIR/systemd-units.txt" 2>&1 || true
  as_service podman ps --all --format json \
    >"$EVIDENCE_DIR/podman-ps.json" 2>&1 || true
  as_service podman network ls --format json \
    >"$EVIDENCE_DIR/podman-networks.json" 2>&1 || true
  as_service podman volume ls --format json \
    >"$EVIDENCE_DIR/podman-volumes.json" 2>&1 || true
  local network purpose
  for purpose in edge identity database egress; do
    network="$(as_service "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" \
      print-network --topology single-node --purpose "$purpose" 2>/dev/null)" || \
      continue
    as_service podman network inspect "$network" \
      >"$EVIDENCE_DIR/network-${purpose}.json" 2>&1 || true
  done
  as_service find "$SERVICE_HOME/.config/containers/systemd" \
    -maxdepth 1 -type f -name 'kravhantering-*' -print -exec sed -n '1,240p' {} \; \
    >"$EVIDENCE_DIR/generated-quadlet-units.txt" 2>&1 || true
  as_service find "$SERVICE_HOME/.config/systemd/user" \
    -maxdepth 1 -type f -name 'kravhantering-*' -print -exec sed -n '1,240p' {} \; \
    >"$EVIDENCE_DIR/generated-systemd-units.txt" 2>&1 || true
  for name in kravhantering-app-runtime kravhantering-keycloak \
    kravhantering-nginx kravhantering-sqlserver; do
    as_service podman inspect "$name" 2>/dev/null |
      jq '.[0] | del(.Config.Env)' \
        >"$EVIDENCE_DIR/${name}-inspect.redacted.json" || true
  done
  service_systemctl show kravhantering-app-runtime.service \
    >"$EVIDENCE_DIR/app-runtime-systemd.txt" 2>&1 || true
  service_systemctl show kravhantering-nginx.service \
    >"$EVIDENCE_DIR/nginx-systemd.txt" 2>&1 || true
  service_systemctl show kravhantering-keycloak.service \
    >"$EVIDENCE_DIR/keycloak-systemd.txt" 2>&1 || true
  service_systemctl show kravhantering-sqlserver.service \
    >"$EVIDENCE_DIR/sqlserver-systemd.txt" 2>&1 || true
  collect_redacted_journal || true
}

collect_redacted_journal() {
  {
    as_service cat "$CONFIG_ROOT/keycloak.env" "$CONFIG_ROOT/sqlserver.env"
    printf '\0'
    as_service journalctl --user -u 'kravhantering-*' --since=-30min \
      --no-pager 2>&1
  } |
    node --input-type=module -e '
      import { redactSensitiveText } from "./scripts/containers/collect-status.mjs"
      let value = ""
      for await (const chunk of process.stdin) value += chunk
      const separator = value.indexOf("\0")
      if (separator < 0) throw new Error("journal secret separator is missing")
      const config = value.slice(0, separator)
      let journal = redactSensitiveText(value.slice(separator + 1))
      for (const line of config.split("\n")) {
        const delimiter = line.indexOf("=")
        if (delimiter < 1) continue
        const key = line.slice(0, delimiter)
        const secret = line.slice(delimiter + 1)
        if (!/(PASSWORD|SECRET|TOKEN)/u.test(key) || secret.length === 0) continue
        journal = journal.split(secret).join("[redacted]")
      }
      process.stdout.write(journal)
    ' >"$EVIDENCE_DIR/journal.redacted.txt"
}

verify_secret_safe_journal() {
  local env_file key line value
  collect_redacted_journal
  for env_file in "$CONFIG_ROOT/keycloak.env" "$CONFIG_ROOT/sqlserver.env"; do
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" == *=* ]] || continue
      key="${line%%=*}"
      value="${line#*=}"
      [[ "$key" =~ (PASSWORD|SECRET|TOKEN) && -n "$value" ]] || continue
      if grep -Fq -- "$value" "$EVIDENCE_DIR/journal.redacted.txt"; then
        fail "redacted journal evidence exposes configured value: $key"
      fi
    done < <(as_service cat "$env_file")
  done
  printf '%s\n' \
    'sqlserver-configured-secrets-absent=passed' \
    'keycloak-configured-secrets-absent=passed' \
    >"$EVIDENCE_DIR/journal-secret-check.txt"
}

verify_normal_service_state() {
  local service="$1" control_group cgroup_root
  [[ "$(service_systemctl show "$service" \
    --property=NRestarts --value)" == 0 ]] || \
    fail "$service restarted during normal or maximum-concurrency smoke"
  control_group="$(service_systemctl show "$service" \
    --property=ControlGroup --value)"
  cgroup_root="/sys/fs/cgroup${control_group}"
  grep -Eq '^oom_kill 0$' "$cgroup_root/memory.events" || \
    fail "$service recorded a cgroup OOM kill during normal smoke"
  {
    printf '## %s memory.events\n' "$service"
    cat "$cgroup_root/memory.events"
    printf '## %s cpu.stat\n' "$service"
    cat "$cgroup_root/cpu.stat"
  } >>"$EVIDENCE_DIR/normal-load-cgroup-state.txt"
}

boundaries() {
  local app_runtime_image_id
  : >"$EVIDENCE_DIR/normal-load-cgroup-state.txt"
  verify_normal_service_state kravhantering-app-runtime.service
  verify_normal_service_state kravhantering-keycloak.service
  verify_normal_service_state kravhantering-nginx.service
  verify_normal_service_state kravhantering-sqlserver.service
  if as_service podman exec kravhantering-app-runtime sh -c \
    'dd if=/dev/zero of=/run/kravhantering/export/must-not-fit bs=1M count=1100 status=none'; then
    as_service podman exec kravhantering-app-runtime \
      rm -f /run/kravhantering/export/must-not-fit
    fail 'application export tmpfs accepted data beyond its configured limit'
  fi
  as_service podman exec kravhantering-app-runtime \
    rm -f /run/kravhantering/export/must-not-fit

  app_runtime_image_id="$(as_service podman container inspect \
    --format '{{.Image}}' kravhantering-app-runtime)" || \
    fail 'could not resolve the running application image ID'
  [[ -n "$app_runtime_image_id" ]] || \
    fail 'running application image ID is empty'
  as_service podman image exists "$app_runtime_image_id" || \
    fail 'running application image is not available in local storage'

  if as_service podman run --pull=never --rm --network none --memory 48m \
    --memory-swap 48m "$app_runtime_image_id" \
    node -e 'Buffer.alloc(256 * 1024 * 1024).fill(1)'; then
    fail 'disposable memory boundary did not terminate an over-limit process'
  fi
  if as_service podman run --pull=never --rm --network none --pids-limit 8 \
    "$app_runtime_image_id" node -e '
      const { spawn } = require("node:child_process")
      const children = []
      let denied = false
      for (let i = 0; i < 32; i += 1) {
        const child = spawn("sleep", ["5"])
        child.once("error", () => { denied = true })
        children.push(child)
      }
      setTimeout(() => {
        for (const child of children) child.kill()
        process.exit(denied ? 23 : 0)
      }, 500)
    '; then
    fail 'disposable PID boundary allowed every requested process'
  fi
  printf '%s\n' \
    'memory-limit-violation=passed' \
    'pid-limit-violation=passed' \
    'tmpfs-limit-violation=passed' \
    >"$EVIDENCE_DIR/resource-boundaries.txt"
}

verify() {
  bash .devcontainer/trust-container-ca.sh
  CI=true npm run test:release-smoke
  boundaries
  verify_secret_safe_journal
  printf '%s\n' \
    'post-containment-upgrade-authentication=passed' \
    'post-containment-upgrade-database-read-write=passed' \
    >"$EVIDENCE_DIR/upgrade.txt"
}

down() {
  local helper="$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh"
  local network purpose uid user_search_path volume volume_status
  id "$SERVICE_USER" >/dev/null 2>&1 || return 0
  mkdir -p "$EVIDENCE_DIR"
  service_systemctl disable --now kravhantering-single-node.target || true
  service_systemctl stop kravhantering-ci-hsa.target || true
  if [[ -x "$helper" ]]; then
    if as_service "$helper" remove --topology "$TOPOLOGY" \
      >"$EVIDENCE_DIR/removal.txt" 2>&1; then
      printf '%s\n' 'quadlet-helper-removal=passed' >>"$EVIDENCE_DIR/removal.txt"
    else
      printf '%s\n' 'quadlet-helper-removal=failed' >>"$EVIDENCE_DIR/removal.txt"
    fi
  else
    printf '%s\n' 'quadlet-helper-removal=skipped-helper-missing' \
      >"$EVIDENCE_DIR/removal.txt"
  fi
  for volume in kravhantering-sqlserver-data kravhantering-keycloak-data; do
    volume_status=failed
    if as_service podman volume exists "$volume"; then
      volume_status=passed
    fi
    printf 'named-volume-%s-survived-helper-removal=%s\n' \
      "$volume" "$volume_status" >>"$EVIDENCE_DIR/removal.txt"
  done
  as_service find "$SERVICE_HOME/.config/containers/systemd" \
    -maxdepth 1 -type f -name 'kravhantering-ci-*' -delete || true
  as_service find "$SERVICE_HOME/.config/systemd/user" \
    -maxdepth 1 -type f -name 'kravhantering-ci-*' -delete || true
  uid="$(service_uid)"
  user_search_path="/etc/containers/systemd/users/$uid"
  if [[ -L "$user_search_path" ]] &&
    [[ "$(readlink "$user_search_path")" == \
      "$SERVICE_HOME/.config/containers/systemd" ]]; then
    sudo unlink "$user_search_path"
  fi
  service_systemctl daemon-reload || true
  as_service podman rm --all --force || true
  as_service podman volume rm kravhantering-ci-hsa-mtls-certs \
    kravhantering-sqlserver-data kravhantering-keycloak-data || true
  for purpose in edge identity database egress; do
    network="$(as_service "$helper" \
      print-network --topology single-node --purpose "$purpose" 2>/dev/null)" || \
      continue
    as_service podman network rm "$network" || true
  done
}

COMMAND="${1-}"
case "$COMMAND" in
  up)
    [[ "${2-}" == --archive && -n "${3-}" ]] || \
      fail 'usage: production-smoke.sh up --archive <path>'
    up "$3"
    ;;
  verify) verify ;;
  boundaries) boundaries ;;
  evidence) evidence ;;
  down) down ;;
  *) fail 'expected up, verify, boundaries, evidence, or down' ;;
esac
