#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevLifecycleLockPath' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the immutable snapshot contains the target' {
    It 'Should derive a canonical checkout-local hash path' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
        ResourceGroup = 'Target-RG'
        VmName = 'Target-VM'
      }

      $path = InModuleScope -Parameters @{ Snapshot = $snapshot } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevLifecycleLockPath -ConfigurationSnapshot $Snapshot
      }

      $path | Should-BeLikeString (
        (Join-Path $TestDrive '.azure/lifecycle-locks/lifecycle-*.lock')
      )
    }
  }
}
