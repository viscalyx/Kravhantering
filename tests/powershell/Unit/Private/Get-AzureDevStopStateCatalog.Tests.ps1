#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevStopStateCatalog' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the supported stop states are requested' {
    It 'Should return the exact normalized state catalog in stable order' {
      $states = @(
        InModuleScope -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevStopStateCatalog
        }
      )

      $states.Count | Should-Be 10
      ($states -join '|') | Should-Be (
        'starting|running|stopping|stopped-allocated|deallocating|' +
        'deallocated|creating|unavailable|not-found|unrecognized'
      )
    }
  }
}
