#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Enter-AzureDevLifecycleLock' -Tag 'Integration' `
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

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When acquiring a target lock in an isolated checkout' {
    It 'Should atomically create a readable owner record' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
      }

      $lock = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $record = Get-Content -LiteralPath $lock.Path -Raw | ConvertFrom-Json

      $record.ownerId | Should-Be $lock.OwnerId
      $record.command | Should-Be 'start'
      $record.processId | Should-Be $PID

      $null = Exit-AzureDevLifecycleLock -Lock $lock
    }
  }
}
