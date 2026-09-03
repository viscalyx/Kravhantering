#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Import-AzureDevEnvFile' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Config'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When reading an isolated dotenv file' {
    It 'Should expose the setup-compatible public command result' {
      $path = Join-Path $TestDrive 'integration.env'
      Set-Content -LiteralPath $path -Value 'EXAMPLE_KEY=example-value'

      $values = Import-AzureDevEnvFile -Path $path

      $values.EXAMPLE_KEY |
        Should-BeString -Expected 'example-value' -CaseSensitive
    }
  }
}
