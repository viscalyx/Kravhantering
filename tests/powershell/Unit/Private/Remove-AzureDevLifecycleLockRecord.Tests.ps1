#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Remove-AzureDevLifecycleLockRecord' -Tag 'Unit' {
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

  Context 'When the record belongs to the invocation' {
    It 'Should remove it' {
      Set-Content `
        -LiteralPath $script:recordPath `
        -Value '{"ownerId":"owner-one"}'

      $removed = InModuleScope `
        -Parameters @{ Path = $script:recordPath } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Remove-AzureDevLifecycleLockRecord `
            -Path $Path `
            -OwnerId 'owner-one'
        }

      $removed | Should-BeTrue
      (Test-Path -LiteralPath $script:recordPath) | Should-BeFalse
    }

    It 'Should preserve it during preview' {
      Set-Content `
        -LiteralPath $script:recordPath `
        -Value '{"ownerId":"owner-one"}'

      $removed = InModuleScope `
        -Parameters @{ Path = $script:recordPath } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Remove-AzureDevLifecycleLockRecord `
            -Path $Path `
            -OwnerId 'owner-one' `
            -WhatIf
        }

      $removed | Should-BeFalse
      (Test-Path -LiteralPath $script:recordPath) | Should-BeTrue
    }
  }

  Context 'When ownership is missing, malformed, or different' {
    BeforeDiscovery {
      $ownerCases = @(
        @{ Name = 'missing'; Json = '{}' },
        @{ Name = 'blank'; Json = '{"ownerId":""}' },
        @{ Name = 'malformed'; Json = '{' },
        @{ Name = 'different'; Json = '{"ownerId":"owner-two"}' }
      )
    }

    It 'Should preserve the <Name> record' -ForEach $ownerCases {
      Set-Content -LiteralPath $script:recordPath -Value $Json

      $removed = InModuleScope `
        -Parameters @{ Path = $script:recordPath } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Remove-AzureDevLifecycleLockRecord `
            -Path $Path `
            -OwnerId 'owner-one'
        }

      $removed | Should-BeFalse
      (Test-Path -LiteralPath $script:recordPath) | Should-BeTrue
    }
  }
}
