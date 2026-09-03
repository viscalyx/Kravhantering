#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe `
  'Connect-AzureDevLifecycleSession' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Azure'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $script:originalPath = [System.Environment]::GetEnvironmentVariable(
      'PATH',
      'Process'
    )
    $script:subscriptionId = '11111111-1111-1111-1111-111111111111'
    $script:tenantId = '22222222-2222-2222-2222-222222222222'
    $script:clientId = '33333333-3333-3333-3333-333333333333'
    $script:clientSecret = 'integration-secret-value'
    $script:config = [System.Management.Automation.PSObject]@{
      SubscriptionId = $script:subscriptionId
      ResourceGroup = 'integration-rg'
      VmName = 'integration-vm'
      TenantId = $script:tenantId
      ClientId = $script:clientId
      ClientSecret = $script:clientSecret
    }
  }

  BeforeEach {
    $binPath = Join-Path $TestDrive 'bin'
    New-Item -ItemType Directory -Path $binPath -Force | Out-Null
    $script:argumentLog = Join-Path $TestDrive 'az-arguments.log'
    $script:repairMarker = Join-Path $TestDrive 'repaired'
    Remove-Item `
      -LiteralPath $script:argumentLog, $script:repairMarker `
      -Force `
      -ErrorAction SilentlyContinue
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
  client_id="$FAKE_AZ_CACHED_CLIENT_ID"
  if [ -f "$FAKE_AZ_REPAIR_MARKER" ]; then
    client_id="$FAKE_AZ_CLIENT_ID"
  fi
  printf '{"id":"%s","tenantId":"%s","user":{"name":"%s","type":"servicePrincipal"}}\n' \
    "$FAKE_AZ_SUBSCRIPTION_ID" "$FAKE_AZ_TENANT_ID" "$client_id"
  exit 0
fi

if [ "$1" = 'account' ] && [ "$2" = 'get-access-token' ]; then
  if [ "$FAKE_AZ_TOKEN_STATUS" = 'stale' ]; then
    printf 'raw token failure must stay private\n' >&2
    exit 1
  fi
  exit 0
fi

if [ "$1" = 'version' ]; then
  printf '2.86.0\n'
  exit 0
fi

if [ "$1" = 'login' ]; then
  : > "$FAKE_AZ_REPAIR_MARKER"
  printf 'raw login output must stay private\n'
  exit 0
fi

printf 'unexpected fake Azure CLI call\n' >&2
exit 99
'@
    $null = & chmod '+x' $fakeAzPath
    [System.Environment]::SetEnvironmentVariable(
      'PATH',
      "$binPath$([System.IO.Path]::PathSeparator)$script:originalPath",
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_ARGUMENT_LOG',
      $script:argumentLog,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_REPAIR_MARKER',
      $script:repairMarker,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_SUBSCRIPTION_ID',
      $script:subscriptionId,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_TENANT_ID',
      $script:tenantId,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_CLIENT_ID',
      $script:clientId,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_CACHED_CLIENT_ID',
      $script:clientId,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_TOKEN_STATUS',
      'usable',
      'Process'
    )
  }

  AfterEach {
    [System.Environment]::SetEnvironmentVariable(
      'PATH',
      $script:originalPath,
      'Process'
    )
    foreach ($name in @(
        'FAKE_AZ_ARGUMENT_LOG',
        'FAKE_AZ_REPAIR_MARKER',
        'FAKE_AZ_SUBSCRIPTION_ID',
        'FAKE_AZ_TENANT_ID',
        'FAKE_AZ_CLIENT_ID',
        'FAKE_AZ_CACHED_CLIENT_ID',
        'FAKE_AZ_TOKEN_STATUS'
      )) {
      [System.Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the isolated cached service principal is exact and usable' {
    It 'Should reuse it through the real native-command boundary' {
      $result = @(Connect-AzureDevLifecycleSession -Config $script:config)
      $calls = @(Get-Content -LiteralPath $script:argumentLog)

      $result | Should-BeCollection @($true)
      $calls.Count | Should-Be 2
      $calls[0] | Should-BeString -CaseSensitive -Expected (
        "CALL`taccount`tshow`t--subscription`t$($script:subscriptionId)" +
        "`t--output`tjson`t--only-show-errors"
      )
      $calls[1] | Should-BeString -CaseSensitive -Expected (
        "CALL`taccount`tget-access-token`t--subscription" +
        "`t$($script:subscriptionId)`t--tenant`t$($script:tenantId)" +
        "`t--output`tnone`t--only-show-errors"
      )
    }
  }

  Context 'When the isolated cached service principal is mismatched' {
    It 'Should repair once without enumerating or selecting subscriptions' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_CACHED_CLIENT_ID',
        '44444444-4444-4444-4444-444444444444',
        'Process'
      )

      $result = @(Connect-AzureDevLifecycleSession -Config $script:config)
      $calls = @(Get-Content -LiteralPath $script:argumentLog)
      $allCalls = $calls -join [System.Environment]::NewLine

      $result | Should-BeCollection @($true)
      @($calls | Where-Object { $_ -like "CALL`tlogin`t*" }).Count |
        Should-Be 1
      $allCalls | Should-MatchString (
        [System.Text.RegularExpressions.Regex]::Escape(
          "--username`t$($script:clientId)" +
          "`t--password=$($script:clientSecret)" +
          "`t--tenant`t$($script:tenantId)" +
          "`t--skip-subscription-discovery`t--subscription" +
          "`t$($script:subscriptionId)`t--output`tnone" +
          "`t--only-show-errors"
        )
      )
      $allCalls | Should-NotMatchString "account`tlist"
      $allCalls | Should-NotMatchString "account`tset"
    }
  }
}
