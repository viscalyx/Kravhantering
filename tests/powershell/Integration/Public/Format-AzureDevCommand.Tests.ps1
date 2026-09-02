#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe 'Format-AzureDevCommand' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Logging'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When combined credentials cross the exported module boundary' {
    It 'Should return one completely redacted command string' {
      $secret = "first line`nsecond line`n"

      $formatted = Format-AzureDevCommand `
        -FilePath 'az' `
        -Arguments @('login', "--password=$secret")

      $formatted | Should-BeString `
        -CaseSensitive `
        -Expected 'az login --password=[redacted]'
    }
  }
}
