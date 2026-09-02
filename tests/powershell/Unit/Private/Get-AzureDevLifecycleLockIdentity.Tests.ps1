#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevLifecycleLockIdentity' -Tag 'Unit' {
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
    It 'Should derive portable hash identities for the target and checkout' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
        ResourceGroup = 'Target-RG'
        VmName = 'Target-VM'
      }

      $identity = InModuleScope `
        -Parameters @{ Snapshot = $snapshot } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevLifecycleLockIdentity `
            -ConfigurationSnapshot $Snapshot
        }

      $identity.Path | Should-BeLikeString (
        (Join-Path $TestDrive '.azure/lifecycle-locks/lifecycle-*.lock')
      )
      $identity.MutexName | Should-MatchString '^[0-9a-f]{64}$'
      $identity.MutexName | Should-NotMatchString 'Target-RG|Target-VM'
    }
  }
}
