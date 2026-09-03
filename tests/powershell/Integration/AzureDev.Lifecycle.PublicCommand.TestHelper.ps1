Set-StrictMode -Version Latest

function New-AzureDevLifecyclePublicCommandFixture {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root
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
  if [ "$FAKE_AZ_PROFILE_MODE" = 'mismatch' ]; then
    client_id='44444444-4444-4444-4444-444444444444'
  fi
  printf '{"id":"%s","tenantId":"%s","user":{"name":"%s","type":"servicePrincipal"}}\n' \
    "$FAKE_AZ_SUBSCRIPTION_ID" "$FAKE_AZ_TENANT_ID" "$client_id"
  exit 0
fi

if [ "$1" = 'account' ] && [ "$2" = 'get-access-token' ]; then
  exit 0
fi

if [ "$1" = 'vm' ] && [ "$2" = 'get-instance-view' ]; then
  state="$FAKE_AZ_VM_STATE"
  if [ -f "$FAKE_AZ_VM_STATE_FILE" ]; then
    state="$(/bin/cat "$FAKE_AZ_VM_STATE_FILE")"
  fi
  if [ "$state" = 'not-found' ]; then
    exit 3
  fi
  if [ "$state" = 'read-failed' ]; then
    exit 1
  fi
  printf '%s\n' "$state"
  if [ -n "$FAKE_AZ_VM_STATE_AFTER_READ" ]; then
    printf '%s\n' "$FAKE_AZ_VM_STATE_AFTER_READ" > "$FAKE_AZ_VM_STATE_FILE"
  fi
  exit 0
fi

if [ "$1" = 'vm' ] && [ "$2" = 'start' ]; then
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

  foreach ($commandName in @(
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
    )) {
    $path = Join-Path $binPath $commandName
    Set-Content -LiteralPath $path -Value @"
#!/bin/sh
printf '%s\n' '$commandName' >> '$forbiddenLog'
exit 97
"@
    $null = & /bin/chmod '+x' $path
  }

  return [pscustomobject]@{
    RepositoryRoot = $repositoryRoot
    BinPath = $binPath
    HomePath = $homePath
    AzureCliHome = $azureCliHome
    ArgumentLog = $argumentLog
    ForbiddenLog = $forbiddenLog
    VmStateFile = $vmStateFile
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
    [pscustomobject]$Fixture
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
    FAKE_AZ_SUBSCRIPTION_ID = $Fixture.SubscriptionId
    FAKE_AZ_TENANT_ID = $Fixture.TenantId
    FAKE_AZ_CLIENT_ID = $Fixture.ClientId
    FAKE_AZ_PROFILE_MODE = 'exact'
    FAKE_AZ_VM_STATE = 'PowerState/running'
    FAKE_AZ_DEALLOCATE_MODE = 'accept'
    FAKE_AZ_VM_STATE_AFTER_READ = $null
    FAKE_AZ_VM_STATE_FILE = $Fixture.VmStateFile
  }
  foreach ($entry in $environment.GetEnumerator()) {
    $existing = Get-Item `
      -LiteralPath "Env:$($entry.Key)" `
      -ErrorAction SilentlyContinue
    $Fixture.OriginalEnvironment[$entry.Key] = [pscustomobject]@{
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
    [pscustomobject]$Fixture
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
    [pscustomobject]$Fixture
  )

  Remove-Item `
    -LiteralPath @(
      $Fixture.ArgumentLog,
      $Fixture.ForbiddenLog,
      $Fixture.VmStateFile
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
    [pscustomobject]$Fixture
  )

  if (-not (Test-Path -LiteralPath $Fixture.ArgumentLog -PathType Leaf)) {
    return @()
  }
  return @(Get-Content -LiteralPath $Fixture.ArgumentLog)
}
