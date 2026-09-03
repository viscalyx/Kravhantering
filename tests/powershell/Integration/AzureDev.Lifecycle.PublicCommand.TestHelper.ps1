Set-StrictMode -Version Latest

function New-AzureDevLifecyclePublicCommandFixture {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.String]$Root
  )

  $fixtureRoot = Join-Path $Root 'azure-dev-lifecycle-public-command'
  $repositoryRoot = Join-Path $fixtureRoot 'repository'
  $binPath = Join-Path $fixtureRoot 'bin'
  $homePath = Join-Path $fixtureRoot 'home'
  $azureCliHome = Join-Path $fixtureRoot 'azure-cli'
  foreach ($path in @(
      $fixtureRoot,
      $repositoryRoot,
      $binPath,
      $homePath,
      $azureCliHome
    )) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }

  $subscriptionId = '11111111-1111-1111-1111-111111111111'
  $tenantId = '22222222-2222-2222-2222-222222222222'
  $clientId = '33333333-3333-3333-3333-333333333333'
  Set-Content `
    -LiteralPath (Join-Path $repositoryRoot '.env.azure.development') `
    -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=isolated-rg
AZURE_DEV_VM_NAME=isolated-vm
AZURE_DEV_VM_SSH_HOST_ALIAS=isolated-alias
'@
  Set-Content `
    -LiteralPath (Join-Path $repositoryRoot '.env.azure.development.local') `
    -Value @"
AZURE_DEV_VM_SUBSCRIPTION_ID=$subscriptionId
AZURE_TENANT_ID=$tenantId
AZURE_CLIENT_ID=$clientId
AZURE_CLIENT_SECRET=fake-harness-secret
"@

  $argumentLog = Join-Path $fixtureRoot 'az-arguments.log'
  $forbiddenLog = Join-Path $fixtureRoot 'forbidden-commands.log'
  $vmStateFile = Join-Path $fixtureRoot 'vm-state'
  $vmStateReadCountFile = Join-Path $fixtureRoot 'vm-state-read-count'
  $repairMarker = Join-Path $fixtureRoot 'repaired-session'
  $resultProbePath = Join-Path $fixtureRoot 'result-probe.ps1'
  Set-Content -LiteralPath $resultProbePath -Value @'
param(
  [System.String]$EntryPoint,
  [System.String]$CommandName,
  [System.String]$RepositoryRoot
)
$result = @(& $EntryPoint `
    $CommandName `
    -RepositoryRoot $RepositoryRoot `
    6>$null)
[System.Management.Automation.PSObject]@{
  Count = $result.Count
  TypeName = if ($result.Count -eq 1) {
    $result[0].PSObject.TypeNames[0]
  } else {
    $null
  }
  PropertyNames = if ($result.Count -eq 1) {
    @($result[0].PSObject.Properties.Name)
  } else {
    @()
  }
  Command = if ($result.Count -eq 1) { $result[0].Command } else { $null }
  Result = if ($result.Count -eq 1) { $result[0].Result } else { $null }
  VmName = if ($result.Count -eq 1) { $result[0].VmName } else { $null }
  ObservedState = if ($result.Count -eq 1) {
    $result[0].ObservedState
  } else {
    $null
  }
  Action = if ($result.Count -eq 1) { $result[0].Action } else { $null }
} | ConvertTo-Json -Compress
'@
  $fakeAzPath = Join-Path $binPath 'az'
  Set-Content -LiteralPath $fakeAzPath -Value @'
#!/bin/sh
set -eu
printf 'CALL' >> "$FAKE_AZ_ARGUMENT_LOG"
for argument in "$@"; do
  printf '\t%s' "$argument" >> "$FAKE_AZ_ARGUMENT_LOG"
done
printf '\n' >> "$FAKE_AZ_ARGUMENT_LOG"

if [ "$1" = 'account' ] && [ "$2" = 'show' ]; then
  if [ "$FAKE_AZ_PROFILE_MODE" = 'missing' ]; then
    exit 1
  fi
  client_id="$FAKE_AZ_CLIENT_ID"
  if [ "$FAKE_AZ_PROFILE_MODE" = 'mismatch' ] &&
    [ ! -f "$FAKE_AZ_REPAIR_MARKER" ]; then
    client_id='44444444-4444-4444-4444-444444444444'
  fi
  printf '{"id":"%s","tenantId":"%s","user":{"name":"%s","type":"servicePrincipal"}}\n' \
    "$FAKE_AZ_SUBSCRIPTION_ID" "$FAKE_AZ_TENANT_ID" "$client_id"
  exit 0
fi

if [ "$1" = 'account' ] && [ "$2" = 'get-access-token' ]; then
  if [ "$FAKE_AZ_TOKEN_MODE" = 'stale' ] &&
    [ ! -f "$FAKE_AZ_REPAIR_MARKER" ]; then
    exit 1
  fi
  exit 0
fi

if [ "$1" = 'version' ]; then
  printf '%s\n' '2.86.0'
  exit 0
fi

if [ "$1" = 'login' ]; then
  if [ "$FAKE_AZ_LOGIN_MODE" = 'reject' ]; then
    exit 1
  fi
  : > "$FAKE_AZ_REPAIR_MARKER"
  exit 0
fi

if [ "$1" = 'vm' ] && [ "$2" = 'get-instance-view' ]; then
  read_count=0
  if [ -f "$FAKE_AZ_VM_STATE_READ_COUNT_FILE" ]; then
    read_count="$(/bin/cat "$FAKE_AZ_VM_STATE_READ_COUNT_FILE")"
  fi
  read_count=$((read_count + 1))
  printf '%s\n' "$read_count" > "$FAKE_AZ_VM_STATE_READ_COUNT_FILE"
  lock_present=0
  for lock_file in "$FAKE_AZ_REPOSITORY_ROOT"/.azure/lifecycle-locks/*.lock; do
    if [ -e "$lock_file" ]; then
      lock_present=1
    fi
  done
  expected_lock_state=''
  if [ -n "${FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE:-}" ]; then
    sequence_position=0
    old_ifs="$IFS"
    IFS=','
    for candidate_lock_state in $FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE; do
      sequence_position=$((sequence_position + 1))
      expected_lock_state="$candidate_lock_state"
      if [ "$sequence_position" -eq "$read_count" ]; then
        break
      fi
    done
    IFS="$old_ifs"
  fi
  if [ "$expected_lock_state" = 'locked' ] && [ "$lock_present" -ne 1 ]; then
    printf '%s\n' 'lifecycle-lock-missing-during-guarded-read' \
      >> "$FAKE_AZ_FORBIDDEN_LOG"
    exit 97
  fi
  if [ "$expected_lock_state" = 'unlocked' ] && [ "$lock_present" -ne 0 ]; then
    printf '%s\n' 'lifecycle-lock-held-during-poll' >> "$FAKE_AZ_FORBIDDEN_LOG"
    exit 97
  fi
  if [ -z "$expected_lock_state" ] && [ "$read_count" -gt 1 ] &&
    [ "${FAKE_AZ_REQUIRE_UNLOCKED_POLL:-}" = '1' ] &&
    [ "$lock_present" -ne 0 ]; then
    printf '%s\n' 'lifecycle-lock-held-during-poll' >> "$FAKE_AZ_FORBIDDEN_LOG"
    exit 97
  fi
  state="$FAKE_AZ_VM_STATE"
  if [ -f "$FAKE_AZ_VM_STATE_FILE" ]; then
    state="$(/bin/cat "$FAKE_AZ_VM_STATE_FILE")"
  fi
  if [ -n "${FAKE_AZ_VM_STATE_SEQUENCE:-}" ]; then
    sequence_position=0
    sequence_state="$state"
    old_ifs="$IFS"
    IFS=','
    for candidate_state in $FAKE_AZ_VM_STATE_SEQUENCE; do
      sequence_position=$((sequence_position + 1))
      sequence_state="$candidate_state"
      if [ "$sequence_position" -eq "$read_count" ]; then
        break
      fi
    done
    IFS="$old_ifs"
    state="$sequence_state"
  fi
  if [ "$state" = 'not-found' ]; then
    exit 3
  fi
  if [ "$state" = 'read-failed' ]; then
    exit 1
  fi
  printf '%s\n' "$state"
  if [ -n "${FAKE_AZ_VM_STATE_AFTER_READ:-}" ] &&
    [ "$read_count" -ge "${FAKE_AZ_STATE_CHANGE_AFTER_READS:-1}" ]; then
    printf '%s\n' "$FAKE_AZ_VM_STATE_AFTER_READ" > "$FAKE_AZ_VM_STATE_FILE"
  fi
  exit 0
fi

if [ "$1" = 'vm' ] && [ "$2" = 'start' ]; then
  if [ "$FAKE_AZ_START_MODE" = 'reject' ]; then
    exit 1
  fi
  exit 0
fi

if [ "$1" = 'vm' ] && [ "$2" = 'deallocate' ]; then
  if [ "$FAKE_AZ_DEALLOCATE_MODE" = 'reject' ]; then
    exit 1
  fi
  exit 0
fi

printf 'unexpected fake Azure CLI call\n' >&2
exit 99
'@
  $null = & /bin/chmod '+x' $fakeAzPath

  $forbiddenCommandNames = @(
      'code',
      'curl',
      'getent',
      'git',
      'host',
      'nslookup',
      'rsync',
      'scp',
      'sftp',
      'ssh',
      'ssh-add',
      'ssh-keygen',
      'ssh-keyscan',
      'wget'
    )
  foreach ($commandName in $forbiddenCommandNames) {
    $path = Join-Path $binPath $commandName
    Set-Content -LiteralPath $path -Value @"
#!/bin/sh
printf '%s\n' '$commandName' >> '$forbiddenLog'
exit 97
"@
    $null = & /bin/chmod '+x' $path
  }

  return [System.Management.Automation.PSObject]@{
    RepositoryRoot = $repositoryRoot
    BinPath = $binPath
    HomePath = $homePath
    AzureCliHome = $azureCliHome
    ArgumentLog = $argumentLog
    ForbiddenLog = $forbiddenLog
    ForbiddenCommandNames = $forbiddenCommandNames
    VmStateFile = $vmStateFile
    VmStateReadCountFile = $vmStateReadCountFile
    RepairMarker = $repairMarker
    ResultProbePath = $resultProbePath
    SubscriptionId = $subscriptionId
    TenantId = $tenantId
    ClientId = $clientId
    OriginalEnvironment = @{}
  }
}

function Enter-AzureDevLifecyclePublicCommandFixture {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  $environment = [ordered]@{
    PATH = $Fixture.BinPath
    HOME = $Fixture.HomePath
    USERPROFILE = $Fixture.HomePath
    AZURE_CONFIG_DIR = $Fixture.AzureCliHome
    AZURE_DEV_VM_SUBSCRIPTION_ID = $null
    AZURE_DEV_VM_RESOURCE_GROUP = $null
    AZURE_DEV_VM_NAME = $null
    AZURE_DEV_VM_SSH_HOST_ALIAS = $null
    AZURE_TENANT_ID = $null
    AZURE_CLIENT_ID = $null
    AZURE_CLIENT_SECRET = $null
    FAKE_AZ_ARGUMENT_LOG = $Fixture.ArgumentLog
    FAKE_AZ_FORBIDDEN_LOG = $Fixture.ForbiddenLog
    FAKE_AZ_REPOSITORY_ROOT = $Fixture.RepositoryRoot
    FAKE_AZ_SUBSCRIPTION_ID = $Fixture.SubscriptionId
    FAKE_AZ_TENANT_ID = $Fixture.TenantId
    FAKE_AZ_CLIENT_ID = $Fixture.ClientId
    FAKE_AZ_PROFILE_MODE = 'exact'
    FAKE_AZ_TOKEN_MODE = 'usable'
    FAKE_AZ_LOGIN_MODE = 'accept'
    FAKE_AZ_REPAIR_MARKER = $Fixture.RepairMarker
    FAKE_AZ_VM_STATE = 'PowerState/running'
    FAKE_AZ_DEALLOCATE_MODE = 'accept'
    FAKE_AZ_START_MODE = 'accept'
    FAKE_AZ_VM_STATE_AFTER_READ = $null
    FAKE_AZ_STATE_CHANGE_AFTER_READS = $null
    FAKE_AZ_VM_STATE_SEQUENCE = $null
    FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE = $null
    FAKE_AZ_VM_STATE_FILE = $Fixture.VmStateFile
    FAKE_AZ_VM_STATE_READ_COUNT_FILE = $Fixture.VmStateReadCountFile
    FAKE_AZ_REQUIRE_UNLOCKED_POLL = '1'
  }
  foreach ($entry in $environment.GetEnumerator()) {
    $existing = Get-Item `
      -LiteralPath "Env:$($entry.Key)" `
      -ErrorAction SilentlyContinue
    $Fixture.OriginalEnvironment[$entry.Key] =
      [System.Management.Automation.PSObject]@{
      Present = $null -ne $existing
      Value = if ($null -eq $existing) { $null } else { $existing.Value }
    }
    if ($null -eq $entry.Value) {
      Remove-Item `
        -LiteralPath "Env:$($entry.Key)" `
        -ErrorAction SilentlyContinue
    } else {
      Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
    }
  }
}

function Exit-AzureDevLifecyclePublicCommandFixture {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  foreach ($entry in $Fixture.OriginalEnvironment.GetEnumerator()) {
    $value = if ($entry.Value.Present) { $entry.Value.Value } else { $null }
    if ($null -eq $value) {
      Remove-Item `
        -LiteralPath "Env:$($entry.Key)" `
        -ErrorAction SilentlyContinue
    } else {
      Set-Item -LiteralPath "Env:$($entry.Key)" -Value $value
    }
  }
}

function Clear-AzureDevLifecyclePublicCommandEvidence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  Remove-Item `
    -LiteralPath @(
      $Fixture.ArgumentLog,
      $Fixture.ForbiddenLog,
      $Fixture.VmStateFile,
      $Fixture.VmStateReadCountFile,
      $Fixture.RepairMarker
    ) `
    -Force `
    -ErrorAction SilentlyContinue
  Remove-Item `
    -LiteralPath (Join-Path $Fixture.RepositoryRoot '.azure') `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue
}

function Get-AzureDevLifecyclePublicCommandCalls {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  if (-not (Test-Path -LiteralPath $Fixture.ArgumentLog -PathType Leaf)) {
    return @()
  }
  return @(Get-Content -LiteralPath $Fixture.ArgumentLog)
}

function Get-AzureDevLifecycleExpectedIdentityCall {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  return (
    "CALL`taccount`tshow`t--subscription" +
    "`t$($Fixture.SubscriptionId)`t--output`tjson`t--only-show-errors"
  )
}

function Get-AzureDevLifecycleExpectedTokenCall {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  return (
    "CALL`taccount`tget-access-token`t--subscription" +
    "`t$($Fixture.SubscriptionId)`t--tenant`t$($Fixture.TenantId)" +
    "`t--output`tnone`t--only-show-errors"
  )
}

function Get-AzureDevLifecycleExpectedVersionCall {
  [CmdletBinding()]
  param()

  return (
    "CALL`tversion`t--query`t`"azure-cli`"`t--output`ttsv" +
    "`t--only-show-errors"
  )
}

function Get-AzureDevLifecycleExpectedLoginCall {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  return (
    "CALL`tlogin`t--service-principal`t--username`t$($Fixture.ClientId)" +
    "`t--password=fake-harness-secret`t--tenant`t$($Fixture.TenantId)" +
    "`t--skip-subscription-discovery`t--subscription" +
    "`t$($Fixture.SubscriptionId)`t--output`tnone`t--only-show-errors"
  )
}

function Get-AzureDevLifecycleExpectedStateCall {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  return (
    "CALL`tvm`tget-instance-view`t--subscription" +
    "`t$($Fixture.SubscriptionId)`t--resource-group" +
    "`tisolated-rg`t--name`tisolated-vm`t--query" +
    "`tinstanceView.statuses[?starts_with(code, 'PowerState/')].code | [0]" +
    "`t--output`ttsv`t--only-show-errors"
  )
}

function Get-AzureDevLifecyclePublicCommandRecords {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$Fixture
  )

  $recordPaths = @(
    Get-ChildItem `
      -LiteralPath (Join-Path $Fixture.RepositoryRoot '.azure/logs') `
      -Filter '*.jsonl' `
      -File `
      -ErrorAction SilentlyContinue |
      ForEach-Object { $_.FullName }
  )
  return @(
    foreach ($recordPath in $recordPaths) {
      foreach ($line in @(Get-Content -LiteralPath $recordPath)) {
        if (-not [System.String]::IsNullOrWhiteSpace($line)) {
          $line | ConvertFrom-Json
        }
      }
    }
  )
}
