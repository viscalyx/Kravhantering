#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Exit-AzureDevLifecycleLock' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the current invocation owns the lock' {
    It 'Should remove its record and make a repeated release harmless' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $lock = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start

      $released = Exit-AzureDevLifecycleLock -Lock $lock
      $releasedAgain = Exit-AzureDevLifecycleLock -Lock $lock

      $released | Should-BeTrue
      $releasedAgain | Should-BeFalse
      (Test-Path -LiteralPath $lock.Path) | Should-BeFalse
    }
  }

  Context 'When a different invocation is represented by the lease' {
    It 'Should preserve the owned lock record' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start `
        -OwnerId 'actual-owner'
      $nonOwner = [pscustomobject]@{
        PSTypeName = 'AzureDev.LifecycleLockLease'
        Path = $owner.Path
        OwnerId = 'different-owner'
        Stream = $null
        Released = $false
      }

      $released = Exit-AzureDevLifecycleLock -Lock $nonOwner

      $released | Should-BeFalse
      (Test-Path -LiteralPath $owner.Path -PathType Leaf) | Should-BeTrue

      $null = Exit-AzureDevLifecycleLock -Lock $owner
    }
  }

  Context 'When the path is replaced before its old owner releases' {
    It 'Should preserve the replacement owner record' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $oldOwner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start `
        -OwnerId 'old-owner'
      [System.IO.File]::Delete($oldOwner.Path)
      Set-Content `
        -LiteralPath $oldOwner.Path `
        -Value '{"ownerId":"replacement-owner"}'

      $released = Exit-AzureDevLifecycleLock -Lock $oldOwner
      $replacement = Get-Content -LiteralPath $oldOwner.Path -Raw |
        ConvertFrom-Json

      $released | Should-BeFalse
      $replacement.ownerId | Should-Be 'replacement-owner'
    }
  }
}
