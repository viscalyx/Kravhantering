#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Open-AzureDevLifecycleLockStream' -Tag 'Unit' {
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

  Context 'When a lock record path is absent' {
    It 'Should create it once with an open owner stream' {
      $path = Join-Path $TestDrive 'target.lock'

      $opened = InModuleScope -Parameters @{ Path = $path } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Open-AzureDevLifecycleLockStream -Path $Path
      }
      $contended = InModuleScope -Parameters @{ Path = $path } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Open-AzureDevLifecycleLockStream -Path $Path
      }

      $opened.Stream.CanWrite | Should-BeTrue
      $opened.RecoveredStaleLock | Should-BeFalse
      $contended | Should-BeNull

      $opened.Stream.Dispose()
    }
  }
}
