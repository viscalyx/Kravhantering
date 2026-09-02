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
sleep 5
printf 'late output\n'
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

  Context 'When the isolated Azure CLI exceeds its call deadline' {
    It 'Should terminate the process and return no late command output' {
      {
        Invoke-AzCli `
          -Arguments @('account', 'show') `
          -TimeoutSeconds 1 `
          -SuppressOutputDetails
      } | Should-Throw -ExceptionMessage '*timed out after 1 seconds*'
    }
  }
}
