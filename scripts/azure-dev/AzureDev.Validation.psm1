Set-StrictMode -Version Latest

$script:AzureDevTerminalFontFamily = 'MesloLGS Nerd Font Mono'
$script:AzureDevTerminalFontFile = 'MesloLGSNerdFontMono-Regular.ttf'

function Test-AzureDevTerminalFontInstalled {
  [CmdletBinding()]
  param()

  $fontPaths = if ($IsMacOS) {
    @(
      (Join-Path $HOME "Library/Fonts/$script:AzureDevTerminalFontFile"),
      "/Library/Fonts/$script:AzureDevTerminalFontFile",
      "/System/Library/Fonts/$script:AzureDevTerminalFontFile"
    )
  } elseif ($IsWindows) {
    @(
      (Join-Path $env:LOCALAPPDATA "Microsoft/Windows/Fonts/$script:AzureDevTerminalFontFile"),
      (Join-Path $env:WINDIR "Fonts/$script:AzureDevTerminalFontFile")
    )
  } else {
    @(
      (Join-Path $HOME ".local/share/fonts/$script:AzureDevTerminalFontFile"),
      (Join-Path $HOME ".fonts/$script:AzureDevTerminalFontFile"),
      "/usr/local/share/fonts/$script:AzureDevTerminalFontFile",
      "/usr/share/fonts/$script:AzureDevTerminalFontFile"
    )
  }

  if (@($fontPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }).Count -gt 0) {
    return $true
  }

  if ($IsWindows) {
    foreach ($registryPath in @(
      'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
      'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
    )) {
      if (-not (Test-Path -LiteralPath $registryPath)) {
        continue
      }
      $fontProperties = (Get-ItemProperty -LiteralPath $registryPath).PSObject.Properties
      if (@($fontProperties | Where-Object {
        $_.Name -like "*$script:AzureDevTerminalFontFamily*"
      }).Count -gt 0) {
        return $true
      }
    }
  }

  if ($IsLinux) {
    $fontConfig = Get-Command 'fc-list' -ErrorAction SilentlyContinue
    if ($null -ne $fontConfig) {
      $fontFamilies = & $fontConfig.Source ':' 'family' 2>$null
      if (
        $LASTEXITCODE -eq 0 -and
        ($fontFamilies -join "`n").Contains($script:AzureDevTerminalFontFamily)
      ) {
        return $true
      }
    }
  }

  return $false
}

function Assert-AzureDevTerminalFontInstalled {
  [CmdletBinding()]
  param()

  $vscodeInstructions = (
    "You must configure VS Code terminal.integrated.fontFamily as " +
    "'$script:AzureDevTerminalFontFamily'."
  )

  if (Test-AzureDevTerminalFontInstalled) {
    Write-Host (
      "Workstation font '$script:AzureDevTerminalFontFamily' found. " +
      $vscodeInstructions
    )
    return
  }

  $installInstructions = if ($IsMacOS) {
    'On macOS, run: brew install --cask font-meslo-lg-nerd-font.'
  } elseif ($IsWindows) {
    'On Windows, download Meslo from Nerd Fonts and install the MesloLGS Nerd Font Mono faces.'
  } elseif ($IsLinux) {
    'On Linux, install the MesloLGS Nerd Font Mono faces and refresh fontconfig with fc-cache -f.'
  } else {
    'Download Meslo from Nerd Fonts and install the MesloLGS Nerd Font Mono faces.'
  }

  throw (
    "Required workstation font '$script:AzureDevTerminalFontFamily' was not found. " +
    'Powerlevel10k is rendered by the local terminal, not by the Azure VM. ' +
    "$installInstructions $vscodeInstructions Then run setup again."
  )
}

function Invoke-AzureDevSmokeValidation {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $remoteScript = @'
set -euo pipefail
expected_git_user_name="$1"
expected_git_user_email="$2"
export HOME=/home/vscode
export XDG_CONFIG_HOME="${HOME}/.config"
export XDG_DATA_HOME="${HOME}/.local/share"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
export CONTAINERS_CONF="${HOME}/.config/containers/containers.conf"
export CONTAINERS_STORAGE_CONF="${HOME}/.config/containers/storage.conf"

managed_units=(
  krav-db.service
  krav-idp.service
  krav-kong.service
  krav-hsa-directory-mock.service
  krav-hsa-person-lookup-adapter.service
)
managed_containers=(
  db
  idp
  kong
  hsa-directory-mock
  hsa-person-lookup-adapter
)

dump_smoke_diagnostics() {
  printf '\nAzure VM smoke validation diagnostics\n'
  printf '\nListening TCP sockets:\n'
  ss -ltn || true
  printf '\nUser systemd environment:\n'
  systemctl --user show-environment || true
  printf '\nFailed user services:\n'
  systemctl --user --failed --no-pager || true

  local unit
  for unit in "${managed_units[@]}"; do
    printf '\nService status for %s:\n' "${unit}"
    systemctl --user status "${unit}" --no-pager || true
    printf '\nService journal for %s:\n' "${unit}"
    journalctl --user -u "${unit}" -n 80 --no-pager || true
  done

  printf '\nPodman containers:\n'
  podman ps -a || true
  printf '\nPodman store:\n'
  podman info --format 'GraphRoot={{.Store.GraphRoot}} RunRoot={{.Store.RunRoot}}' || true
  printf '\nPodman networks:\n'
  podman network ls || true
  printf '\nPodman volumes:\n'
  podman volume ls || true

  local container
  for container in "${managed_containers[@]}"; do
    printf '\nContainer logs for %s:\n' "${container}"
    podman logs --tail 100 "${container}" || true
  done
}

require_loopback_port() {
  local name="$1"
  local port="$2"
  local attempt

  for attempt in $(seq 1 24); do
    if ss -ltn | grep -q "127.0.0.1:${port}"; then
      return
    fi
    sleep 5
  done

  printf 'Missing loopback listener for %s on 127.0.0.1:%s\n' "${name}" "${port}"
  dump_smoke_diagnostics
  exit 1
}

wait_for_sql_server_login() {
  local attempt
  local wait_output

  wait_output="$(mktemp)"
  for attempt in $(seq 1 8); do
    printf 'Waiting for SQL Server login readiness, attempt %s/8...\n' "${attempt}"
    if node scripts/db-sqlserver-admin.mjs wait >"${wait_output}" 2>&1; then
      cat "${wait_output}"
      rm -f "${wait_output}"
      return
    fi

    if [ "${attempt}" -lt 8 ]; then
      sleep 10
    fi
  done

  printf 'SQL Server did not become login-ready before database setup.\n'
  printf '\nLast db:wait output:\n'
  cat "${wait_output}" || true
  rm -f "${wait_output}"
  dump_smoke_diagnostics
  exit 1
}

run_workspace_command_or_diagnose() {
  local description="$1"
  shift

  if "$@"; then
    return
  fi

  printf '%s failed.\n' "${description}"
  dump_smoke_diagnostics
  exit 1
}

python3 - <<'PY'
from pathlib import Path
import sys

import yaml

path = Path('/workspace/containers/kong/kong.yml')
data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
expected = {'http', 'https'}

for service in data.get('services') or []:
    for route in service.get('routes') or []:
        if route.get('name') == 'hsa-directory-person-lookup-rest':
            protocols = route.get('protocols')
            if isinstance(protocols, list) and expected.issubset(set(protocols)):
                sys.exit(0)
            print('Kong HSA route must allow both http and https protocols')
            sys.exit(1)

print('Kong HSA route hsa-directory-person-lookup-rest not found')
sys.exit(1)
PY

python3 - <<'PY'
from pathlib import Path
import tomllib

config = tomllib.loads(
    Path('/home/vscode/.codex/config.toml').read_text(encoding='utf-8')
)
assert config['approval_policy'] == 'never'
assert config['default_permissions'] == 'kravhantering-azure-dev'
assert config['projects']['/workspace']['trust_level'] == 'trusted'
profile = config['permissions']['kravhantering-azure-dev']
assert profile['extends'] == ':workspace'
assert profile['network']['enabled'] is True
assert profile['network']['allow_local_binding'] is True
assert profile['network']['domains'] == {
    'localhost': 'allow',
    '127.0.0.1': 'allow',
    '::1': 'allow',
}
PY

sudo -n test -f /etc/apparmor.d/bwrap-userns-restrict
/usr/bin/bwrap \
  --ro-bind / / \
  --dev /dev \
  --proc /proc \
  --unshare-user \
  --unshare-pid \
  --unshare-net \
  -- /bin/true

test -d /workspace
test "$(stat -c '%U' /workspace)" = "vscode"
test -d /workspace/.git
if ! {
  sudo -n test -f /etc/ssh/sshd_config.d/00-kravhantering-root-login.conf &&
    sudo -n test -f /etc/ssh/sshd_config.d/01-kravhantering-environment.conf &&
    root_login_policy="$(
      sudo -n /usr/sbin/sshd -T \
        -C user=root,host=localhost,addr=127.0.0.1 \
        | awk '$1 == "permitrootlogin" { print $2 }'
    )" &&
    test "${root_login_policy}" = "no" &&
    sudo -n /usr/sbin/sshd -T \
      -C user=vscode,host=localhost,addr=127.0.0.1 \
      | grep -E '^acceptenv (.* )?GH_TOKEN( |$)' >/dev/null
}; then
  printf 'SSH root-login or environment validation failed.\n'
  dump_smoke_diagnostics
  exit 1
fi
findmnt /mnt/krav-azure-dev-data >/dev/null
findmnt /workspace >/dev/null
findmnt /var/lib/krav-azure-dev >/dev/null
findmnt /home/vscode/.local/share/containers/storage >/dev/null
data_device_real="$(readlink -f /dev/disk/azure/scsi1/lun0)"
data_mount_source="$(findmnt -n -o SOURCE /mnt/krav-azure-dev-data)"
data_mount_real="$(readlink -f "${data_mount_source}")"
test "${data_mount_real}" = "${data_device_real}"
data_device_number="$(stat -c '%d' /mnt/krav-azure-dev-data)"
test "$(stat -c '%d' /workspace)" = "${data_device_number}"
test "$(stat -c '%d' /var/lib/krav-azure-dev)" = "${data_device_number}"
test "$(stat -c '%d' /home/vscode/.local/share/containers/storage)" = "${data_device_number}"
grep -Fq 'graphroot = "/home/vscode/.local/share/containers/storage"' /home/vscode/.config/containers/storage.conf
grep -Fq 'rootless_storage_path = "/home/vscode/.local/share/containers/storage"' /home/vscode/.config/containers/storage.conf
test "$(podman info --format '{{.Store.GraphRoot}}')" = "/home/vscode/.local/share/containers/storage"
podman network exists krav-support
node --version 2>/dev/null | grep -Eq '^v24\.'
npm --version >/dev/null 2>&1
dotnet --version 2>/dev/null | grep -Eq '^8\.'
git --version >/dev/null 2>&1
test "$(git config --global --get user.name)" = "${expected_git_user_name}"
test "$(git config --global --get user.email)" = "${expected_git_user_email}"
gh --version >/dev/null 2>&1
btop --version >/dev/null 2>&1
codex --version >/dev/null 2>&1
copilot --version >/dev/null 2>&1
docker --version >/dev/null 2>&1
docker compose version >/dev/null 2>&1
docker buildx version >/dev/null 2>&1
podman --version >/dev/null 2>&1
podman-compose --version >/dev/null 2>&1
python3 --version >/dev/null 2>&1
dotenv-linter --version >/dev/null 2>&1
lychee --version >/dev/null 2>&1
test -x /workspace/node_modules/.bin/playwright
/workspace/node_modules/.bin/playwright --version >/dev/null 2>&1
loginctl show-user vscode -p Linger | grep -q 'Linger=yes'
check_user_service() {
  local unit="$1"
  local container="${2:-}"
  if systemctl --user is-active --quiet "${unit}"; then
    return
  fi

  printf 'User service is not active: %s\n' "${unit}"
  if [ -n "${container}" ]; then
    printf '\nContainer logs for %s:\n' "${container}"
    podman logs --tail 120 "${container}" || true
  fi
  dump_smoke_diagnostics
  exit 1
}
check_user_service krav-db.service db
check_user_service krav-idp.service idp
check_user_service krav-kong.service kong
check_user_service krav-hsa-directory-mock.service hsa-directory-mock
check_user_service krav-hsa-person-lookup-adapter.service hsa-person-lookup-adapter
require_loopback_port 'SQL Server' 1433
require_loopback_port 'Keycloak' 8080
require_loopback_port 'Kong HSA proxy' 18000
if ! grep -Fq 'HSA_PERSON_LOOKUP_URL=http://127.0.0.1:18000/hsa/person-records/lookup' /workspace/.env.development.local; then
  printf 'Missing managed HSA_PERSON_LOOKUP_URL in /workspace/.env.development.local\n'
  dump_smoke_diagnostics
  exit 1
fi
hsa_response="$(mktemp)"
hsa_headers="$(mktemp)"
hsa_exit=1
hsa_status=000
hsa_succeeded=false
for attempt in $(seq 1 24); do
  : > "${hsa_response}"
  : > "${hsa_headers}"
  set +e
  hsa_status="$(curl -s -o "${hsa_response}" -D "${hsa_headers}" -w '%{http_code}' -X POST http://127.0.0.1:18000/hsa/person-records/lookup \
    -H 'content-type: application/json' \
    --data '{"hsaId":"SE5560000001-manualarea1"}')"
  hsa_exit=$?
  set -e
  if [ "${hsa_exit}" -eq 0 ] && [ "${hsa_status}" = "200" ]; then
    hsa_succeeded=true
    break
  fi
  if [ "${attempt}" -lt 24 ]; then
    sleep 5
  fi
done
if [ "${hsa_succeeded}" != "true" ]; then
  printf 'HSA smoke request failed. curl exit: %s HTTP status: %s\n' "${hsa_exit}" "${hsa_status:-unknown}"
  printf '\nResponse headers:\n'
  cat "${hsa_headers}" || true
  printf '\nResponse body:\n'
  cat "${hsa_response}" || true
  printf '\nKong health:\n'
  podman exec kong kong health || true
  printf '\nKong root HTTP probe:\n'
  curl -sv http://127.0.0.1:18000/ >/dev/null || true
  dump_smoke_diagnostics
  rm -f "${hsa_response}" "${hsa_headers}"
  exit 1
fi
rm -f "${hsa_response}" "${hsa_headers}"
cd /workspace
wait_for_sql_server_login
run_workspace_command_or_diagnose 'SQL Server database setup' npm run db:setup
run_workspace_command_or_diagnose 'SQL Server health check' npm run db:health
run_workspace_command_or_diagnose 'Playwright dry-run install check' ./node_modules/.bin/playwright install --dry-run chromium
'@

  $remoteScriptLiteral = ConvertTo-AzureDevShellLiteral -Value $remoteScript
  $gitUserNameLiteral = ConvertTo-AzureDevShellLiteral `
    -Value $Context.Config.GitUserName
  $gitUserEmailLiteral = ConvertTo-AzureDevShellLiteral `
    -Value $Context.Config.GitUserEmail
  $command = (
    "bash -lc $remoteScriptLiteral -- " +
    "$gitUserNameLiteral $gitUserEmailLiteral"
  )

  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Run smoke validation')) {
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh' `
      -Arguments @(
        '-o',
        'BatchMode=yes',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        $Context.Config.SshHostAlias,
        $command
      )
    if ($result.ExitCode -ne 0) {
      throw "Azure VM smoke validation failed.`n$($result.Text.Trim())"
    }
  }
}

function Get-AzureDevValidationStatus {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object]$State
  )

  if ($null -eq $State -or $null -eq $State.lastValidationStatus) {
    return 'not-run'
  }
  return $State.lastValidationStatus
}

Export-ModuleMember -Function `
  Assert-AzureDevTerminalFontInstalled, `
  Get-AzureDevValidationStatus, `
  Invoke-AzureDevSmokeValidation, `
  Test-AzureDevTerminalFontInstalled
