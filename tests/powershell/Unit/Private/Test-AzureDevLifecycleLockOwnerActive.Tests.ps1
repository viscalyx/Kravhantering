#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevLifecycleLockOwnerActive' -Tag 'Unit' {
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

  Context 'When owner evidence identifies the current process' {
    It 'Should preserve the active lock' {
      $record = [pscustomobject]@{
        host = [System.Net.Dns]::GetHostName()
        processId = $PID
      }

      $active = InModuleScope -Parameters @{ Record = $record } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevLifecycleLockOwnerActive -Record $Record
      }

      $active | Should-BeTrue
    }
  }

  Context 'When same-host owner evidence identifies no process' {
    It 'Should classify the record as abandoned' {
      $record = [pscustomobject]@{
        host = [System.Net.Dns]::GetHostName()
        processId = [int]::MaxValue
      }

      $active = InModuleScope -Parameters @{ Record = $record } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevLifecycleLockOwnerActive -Record $Record
      }

      $active | Should-BeFalse
    }
  }
}
