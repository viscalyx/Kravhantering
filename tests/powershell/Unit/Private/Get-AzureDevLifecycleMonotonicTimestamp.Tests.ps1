#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevLifecycleMonotonicTimestamp' -Tag 'Unit' {
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

  Context 'When reading the production contention clock' {
    It 'Should return nondecreasing Stopwatch timestamps' {
      $timestamps = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        @(
          Get-AzureDevLifecycleMonotonicTimestamp
          Get-AzureDevLifecycleMonotonicTimestamp
        )
      }

      $timestamps[0] | Should-HaveType ([System.Int64])
      $timestamps[1] | Should-BeGreaterThanOrEqual $timestamps[0]
    }
  }
}
