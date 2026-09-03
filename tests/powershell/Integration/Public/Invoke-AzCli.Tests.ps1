#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe 'Invoke-AzCli' -Tag 'Integration' `
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
  }

  BeforeEach {
    $binPath = Join-Path $TestDrive 'bin'
    New-Item -ItemType Directory -Path $binPath -Force | Out-Null
    $fakeAzPath = Join-Path $binPath 'az'
    Set-Content -LiteralPath $fakeAzPath -Value @'
#!/bin/sh
printf '{"status":"usable"}\n'
printf 'diagnostic warning\n' >&2
'@
    $null = & chmod '+x' $fakeAzPath
    [System.Environment]::SetEnvironmentVariable(
      'PATH',
      "$binPath$([System.IO.Path]::PathSeparator)$script:originalPath",
      'Process'
    )
  }

  AfterEach {
    [System.Environment]::SetEnvironmentVariable(
      'PATH',
      $script:originalPath,
      'Process'
    )
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the isolated Azure CLI completes within its call deadline' {
    It 'Should return parsed output from the real native boundary' {
      $result = Invoke-AzCli `
        -Arguments @('account', 'show') `
        -Json `
        -TimeoutSeconds 120 `
        -SuppressOutputDetails

      $result.status | Should-Be 'usable'
    }
  }
}
