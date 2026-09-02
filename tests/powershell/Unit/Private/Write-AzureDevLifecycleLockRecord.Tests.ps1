#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Write-AzureDevLifecycleLockRecord' -Tag 'Unit' {
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

  Context 'When writing owner metadata' {
    It 'Should replace the record and preserve the owner stream' {
      $path = Join-Path $TestDrive 'target.lock'
      $stream = [System.IO.File]::Open(
        $path,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::Read
      )
      $record = [ordered]@{ ownerId = 'owner-one'; command = 'start' }

      $null = InModuleScope `
        -Parameters @{ Stream = $stream; Record = $record } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLockRecord -Stream $Stream -Record $Record
        }
      $text = Get-Content -LiteralPath $path -Raw

      $stream.CanWrite | Should-BeTrue
      $text | Should-MatchString '"ownerId":"owner-one"'

      $stream.Dispose()
    }
  }
}
