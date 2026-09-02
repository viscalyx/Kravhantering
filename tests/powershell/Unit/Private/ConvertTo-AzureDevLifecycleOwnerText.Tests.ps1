#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'ConvertTo-AzureDevLifecycleOwnerText' -Tag 'Unit' {
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

  Context 'When owner metadata contains unsafe control characters' {
    It 'Should emit only bounded diagnostic fields' {
      $record = [pscustomobject]@{
        command = "start`nforged"
        processId = 42
        host = 'test-host'
        user = 'test-user'
        startedAt = '2026-09-02T08:00:00Z'
        secret = 'must-not-appear'
      }

      $text = InModuleScope -Parameters @{ Record = $record } -ScriptBlock {
        Set-StrictMode -Version 1.0
        ConvertTo-AzureDevLifecycleOwnerText -Record $Record
      }

      $text | Should-MatchString 'command=start\?forged'
      $text | Should-NotMatchString 'must-not-appear'
    }
  }
}
