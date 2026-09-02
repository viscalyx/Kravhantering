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

  BeforeEach {
    $script:recordPath = Join-Path $TestDrive 'target.lock'
  }

  AfterEach {
    Remove-Item `
      -LiteralPath $script:recordPath `
      -Force `
      -ErrorAction SilentlyContinue
  }

  Context 'When writing owner metadata' {
    It 'Should atomically replace the prior diagnostic record' {
      Set-Content `
        -LiteralPath $script:recordPath `
        -Value '{"ownerId":"stale-owner"}'
      $record = [ordered]@{ ownerId = 'owner-one'; command = 'start' }

      $null = InModuleScope `
        -Parameters @{ Path = $script:recordPath; Record = $record } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLockRecord -Path $Path -Record $Record
        }
      $text = Get-Content -LiteralPath $script:recordPath -Raw

      $text | Should-MatchString '"ownerId":"owner-one"'
      @(Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp').Count |
        Should-Be 0
    }
  }
}
