#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Exit-AzureDevLifecycleLock' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
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

  BeforeEach {
    $script:ownedLocks = @()
  }

  AfterEach {
    foreach ($ownedLock in $script:ownedLocks) {
      if (-not $ownedLock.Released) {
        $null = Exit-AzureDevLifecycleLock -Lock $ownedLock
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When releasing the acquired checkout-local lock' {
    It 'Should remove only the owned target record' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
      }
      $lock = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName stop
      $script:ownedLocks += $lock

      $released = Exit-AzureDevLifecycleLock -Lock $lock

      $released | Should-BeTrue
      (Test-Path -LiteralPath $lock.Path) | Should-BeFalse
    }
  }
}
