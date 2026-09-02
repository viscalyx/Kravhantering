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
      -Recurse `
      -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp' -Recurse |
      Remove-Item -Force -ErrorAction SilentlyContinue
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

    It 'Should write no record or temporary file during preview' {
      $record = [ordered]@{ ownerId = 'owner-preview'; command = 'start' }

      $null = InModuleScope `
        -Parameters @{ Path = $script:recordPath; Record = $record } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLockRecord `
            -Path $Path `
            -Record $Record `
            -WhatIf
        }

      (Test-Path -LiteralPath $script:recordPath) | Should-BeFalse
      @(Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp').Count |
        Should-Be 0
    }

    It 'Should leave no temporary record after a real write failure' {
      $missingPath = Join-Path $TestDrive 'missing/target.lock'
      $record = [ordered]@{ ownerId = 'owner-write'; command = 'start' }

      {
        $null = InModuleScope `
          -Parameters @{ Path = $missingPath; Record = $record } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Write-AzureDevLifecycleLockRecord -Path $Path -Record $Record
          }
      } | Should-Throw

      @(
        Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp' -Recurse
      ).Count | Should-Be 0
    }

    It 'Should leave no temporary record after a real move failure' {
      $null = New-Item `
        -ItemType Directory `
        -Path $script:recordPath
      $record = [ordered]@{ ownerId = 'owner-move'; command = 'stop' }

      {
        $null = InModuleScope `
          -Parameters @{ Path = $script:recordPath; Record = $record } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Write-AzureDevLifecycleLockRecord -Path $Path -Record $Record
          }
      } | Should-Throw

      (Test-Path -LiteralPath $script:recordPath -PathType Container) |
        Should-BeTrue
      @(
        Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp' -Recurse
      ).Count | Should-Be 0
    }
  }
}
