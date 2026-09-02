#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Write-AzureDevLifecycleLogRecord' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
  }

  BeforeEach {
    $script:record = InModuleScope -Parameters @{
      RepositoryRoot = $TestDrive
    } -ScriptBlock {
      Set-StrictMode -Version 1.0
      $configuration = [pscustomobject]@{
        RepoRoot = $RepositoryRoot
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'krav-dev-rg'
        VmName = 'krav-dev-vm'
      }
      $configuration.PSObject.TypeNames.Insert(
        0,
        'AzureDev.LifecycleConfigurationSnapshot'
      )
      $result = New-AzureDevLifecycleResult `
        -Command start `
        -Result already-running `
        -VmName 'krav-dev-vm' `
        -ObservedState running `
        -Action none
      return New-AzureDevLifecycleLogRecord `
        -Configuration $configuration `
        -LifecycleResult $result `
        -MutationAccepted $false `
        -Timestamp ([System.DateTimeOffset]::Parse('2026-09-02T18:30:00Z')) `
        -ElapsedMilliseconds 250
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When a completed real attempt is eligible for diagnosis' {
    It 'Should append exactly one JSONL record to the UTC daily log' {
      InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        Set-StrictMode -Version 1.0

        $success = @(
          Write-AzureDevLifecycleLogRecord `
            -RepositoryRoot $RepositoryRoot `
            -Record $Record
        )

        $success.Count | Should-Be 0
        $path = Join-Path $RepositoryRoot '.azure/logs/20260902.jsonl'
        Test-Path -LiteralPath $path -PathType Leaf | Should-BeTrue
        $lines = @(Get-Content -LiteralPath $path)
        $lines.Count | Should-Be 1
        ($lines[0] | ConvertFrom-Json).terminalResult |
          Should-Be 'already-running'
      }
    }
  }

  Context 'When lifecycle logging is previewed' {
    It 'Should not create a directory or append a record' {
      InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        Set-StrictMode -Version 1.0

        $null = Write-AzureDevLifecycleLogRecord `
          -RepositoryRoot $RepositoryRoot `
          -Record $Record `
          -WhatIf

        Test-Path -LiteralPath (Join-Path $RepositoryRoot '.azure') |
          Should-BeFalse
      }
    }
  }

  Context 'When appending a lifecycle record fails' {
    It 'Should emit one warning and no success output' {
      Mock -CommandName Add-Content -MockWith {
        throw 'simulated diagnostic disk failure'
      }
      Mock -CommandName Write-Warning

      $success = InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        return @(
          Write-AzureDevLifecycleLogRecord `
            -RepositoryRoot $RepositoryRoot `
            -Record $Record
        )
      }

      $success.Count | Should-Be 0
      Should-Invoke -CommandName Add-Content -Exactly -Times 1 -Scope It
      Should-Invoke `
        -CommandName Write-Warning `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Message -like '*lifecycle log record could not be written*'
        }
    }
  }
}
