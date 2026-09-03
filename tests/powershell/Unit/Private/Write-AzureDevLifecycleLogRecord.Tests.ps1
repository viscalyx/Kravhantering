#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Write-AzureDevLifecycleLogRecord' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($module in @(
        'AzureDev.Logging.psm1',
        'AzureDev.Lifecycle.psm1'
      )) {
      Import-Module (
        Join-Path $script:repositoryRoot "scripts/azure-dev/$module"
      ) -Force -ErrorAction Stop
    }
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
      $configuration = [System.Management.Automation.PSObject]@{
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
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When a completed real attempt is eligible for diagnosis' {
    It 'Should append exactly one JSONL record to the UTC daily log' {
      InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        $success = @(
          Set-StrictMode -Version 1.0
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
    BeforeAll {
      Mock -CommandName Add-Content -MockWith {
        throw 'simulated diagnostic disk failure'
      }
    }

    It 'Should preserve warning-only output under terminating caller warnings' {
      $output = InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        return @(
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLogRecord `
            -RepositoryRoot $RepositoryRoot `
            -Record $Record `
            -WarningAction Stop 3>&1
        )
      }

      Should-Invoke -CommandName Add-Content -Exactly -Times 1 -Scope It
      @(
        $output | Where-Object {
          $_ -is [System.Management.Automation.WarningRecord]
        }
      ).Count | Should-Be 1
      @(
        $output | Where-Object {
          $_ -isnot [System.Management.Automation.WarningRecord]
        }
      ).Count | Should-Be 0
    }
  }

  Context 'When directory creation reports a non-terminating filesystem error' {
    It 'Should convert it to one warning without an error-stream record' {
      $blockingPath = Join-Path $TestDrive '.azure'
      Set-Content -LiteralPath $blockingPath -Value 'not a directory'

      $output = InModuleScope -Parameters @{
        Record = $script:record
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        return @(
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLogRecord `
            -RepositoryRoot $RepositoryRoot `
            -Record $Record `
            -WarningAction Stop 3>&1
        )
      }

      @(
        $output | Where-Object {
          $_ -is [System.Management.Automation.WarningRecord]
        }
      ).Count | Should-Be 1
      @(
        $output | Where-Object {
          $_ -is [System.Management.Automation.ErrorRecord]
        }
      ).Count | Should-Be 0
      Test-Path -LiteralPath "$blockingPath/logs" | Should-BeFalse
    }
  }

  Context 'When the value is not a lifecycle log record' {
    It 'Should reject the value before attempting filesystem access' {
      InModuleScope -Parameters @{ RepositoryRoot = $TestDrive } -ScriptBlock {
        {
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleLogRecord `
            -RepositoryRoot $RepositoryRoot `
            -Record ([System.Management.Automation.PSObject]@{})
        } | Should-Throw -ExceptionMessage '*lifecycle log record*'
      }
    }
  }
}
