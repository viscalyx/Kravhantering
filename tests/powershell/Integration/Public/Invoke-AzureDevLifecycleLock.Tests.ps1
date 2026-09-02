#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Invoke-AzureDevLifecycleLock' -Tag 'Integration' `
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

  Context 'When guarded lifecycle work fails' {
    It 'Should leave no owned lock record in the isolated checkout' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
      }
      $script:lockPath = $null

      {
        $null = Invoke-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName start `
          -ScriptBlock {
            param($Lock, $ConfigurationSnapshot)
            $script:lockPath = $Lock.Path
            throw 'integration failure'
          }
      } | Should-Throw -ExceptionMessage '*integration failure*'

      (Test-Path -LiteralPath $script:lockPath) | Should-BeFalse
    }
  }
}
