#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Move-AzureDevStaleLifecycleLock' -Tag 'Unit' {
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

  Context 'When same-host owner evidence is abandoned' {
    It 'Should atomically claim and remove the stale directory entry' {
      $path = Join-Path $TestDrive 'target.lock'
      Set-Content -LiteralPath $path -Value '{}'
      $record = [pscustomobject]@{
        host = [System.Net.Dns]::GetHostName()
        processId = [int]::MaxValue
      }

      $recovered = InModuleScope `
        -Parameters @{ Path = $path; Record = $record } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Move-AzureDevStaleLifecycleLock -Path $Path -Record $Record
        }

      $recovered | Should-BeTrue
      (Test-Path -LiteralPath $path) | Should-BeFalse
    }
  }
}
