#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Read-AzureDevLifecycleLockRecord' -Tag 'Unit' {
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

  Context 'When the owner record is readable JSON' {
    It 'Should return its metadata without retaining a file handle' {
      $path = Join-Path $TestDrive 'target.lock'
      Set-Content -LiteralPath $path -Value '{"ownerId":"owner-one"}'

      $record = InModuleScope -Parameters @{ Path = $path } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Read-AzureDevLifecycleLockRecord -Path $Path
      }

      $record.ownerId | Should-Be 'owner-one'
      Remove-Item -LiteralPath $path -Force
      (Test-Path -LiteralPath $path) | Should-BeFalse
    }
  }

  Context 'When the owner record is malformed' {
    It 'Should return no unsafe owner metadata' {
      $path = Join-Path $TestDrive 'malformed.lock'
      Set-Content -LiteralPath $path -Value '{'

      $record = InModuleScope -Parameters @{ Path = $path } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Read-AzureDevLifecycleLockRecord -Path $Path
      }

      $record | Should-BeNull
    }
  }
}
