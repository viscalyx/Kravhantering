#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Complete-AzureDevLifecycleAttempt' -Tag 'Unit' {
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
    Mock -CommandName Add-Content -MockWith {
      if ($script:mockLockHeld) {
        throw 'record attempted while the lifecycle lock was held'
      }
    }
  }

  BeforeEach {
    $script:mockLockHeld = $true
    $script:completionContracts = InModuleScope -Parameters @{
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
        -Result running `
        -VmName 'krav-dev-vm' `
        -ObservedState running `
        -Action joined-start
      $failure = New-AzureDevLifecycleErrorRecord `
        -Phase running-wait `
        -Message 'The VM did not reach running before the deadline.' `
        -Command start `
        -VmName 'krav-dev-vm' `
        -ObservedState starting `
        -Action joined-start `
        -MutationAccepted $false
      return [System.Management.Automation.PSObject]@{
        Result = $result
        SuccessRecord = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -LifecycleResult $result `
          -MutationAccepted $false `
          -ElapsedMilliseconds 30000
        Failure = $failure
        FailureRecord = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Failure $failure `
          -ElapsedMilliseconds 600000
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When a successful attempt completes after lock release' {
    It 'Should write once and preserve exactly one typed result' {
      $script:mockLockHeld = $false

      $result = InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Complete-AzureDevLifecycleAttempt `
          -RepositoryRoot $RepositoryRoot `
          -Record $Contracts.SuccessRecord `
          -LifecycleResult $Contracts.Result
      }

      @($result).Count | Should-Be 1
      $result.PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      Should-Invoke -CommandName Add-Content -Exactly -Times 1 -Scope It
    }
  }

  Context 'When a failed attempt completes after lock release' {
    It 'Should write once and rethrow the one primary terminating error' {
      $script:mockLockHeld = $false

      {
        InModuleScope -Parameters @{
          Contracts = $script:completionContracts
          RepositoryRoot = $TestDrive
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $Contracts.Failure
        }
      } | Should-Throw -ExceptionMessage '*did not reach running*'
      Should-Invoke -CommandName Add-Content -Exactly -Times 1 -Scope It
    }
  }

  Context 'When diagnostic persistence fails' {
    It 'Should preserve success under terminating caller warnings' {
      $output = InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        return @(
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult $Contracts.Result `
            -WarningAction Stop 3>&1
        )
      }

      $result = @($output | Where-Object {
          $_.PSObject.TypeNames[0] -eq 'AzureDev.LifecycleResult'
        })
      @($result).Count | Should-Be 1
      $result.Result | Should-Be 'running'
      @($output | Where-Object {
          $_ -is [System.Management.Automation.WarningRecord]
        }).Count | Should-Be 1
    }

    It 'Should preserve the primary error under terminating caller warnings' {
      {
        InModuleScope -Parameters @{
          Contracts = $script:completionContracts
          RepositoryRoot = $TestDrive
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $Contracts.Failure `
            -WarningAction Stop
        }
      } | Should-Throw -ExceptionMessage '*did not reach running*'
    }
  }

  Context 'When completion is previewed' {
    BeforeAll {
      Mock -CommandName Write-AzureDevLifecycleLogRecord
    }

    It 'Should return no result and perform no lifecycle-log write' {
      $result = InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        return @(
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult $Contracts.Result `
            -WhatIf
        )
      }

      @($result).Count | Should-Be 0
      Should-NotInvoke `
        -CommandName Write-AzureDevLifecycleLogRecord `
        -Scope It
    }
  }

  Context 'When the completion contracts disagree' {
    BeforeDiscovery {
      $successMismatchCases = @(
        @{ Field = 'terminalResult'; Value = 'already-running' },
        @{ Field = 'command'; Value = 'stop' },
        @{ Field = 'vmName'; Value = 'other-vm' },
        @{ Field = 'observedState'; Value = 'starting' },
        @{ Field = 'action'; Value = 'start-requested' },
        @{ Field = 'mutationAccepted'; Value = $true }
      )
      $failureMismatchCases = @(
        @{ Field = 'failurePhase'; Value = 'outside-interference' },
        @{ Field = 'command'; Value = 'stop' },
        @{ Field = 'vmName'; Value = 'other-vm' },
        @{ Field = 'observedState'; Value = 'running' },
        @{ Field = 'action'; Value = 'start-requested' },
        @{ Field = 'mutationAccepted'; Value = $true }
      )
    }

    It 'Should reject an untyped record' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record ([System.Management.Automation.PSObject]@{}) `
            -LifecycleResult $Contracts.Result
        } | Should-Throw -ExceptionMessage '*lifecycle log record*'
      }
    }

    It 'Should reject an untyped lifecycle result' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult ([System.Management.Automation.PSObject]@{
              Result = 'running'
            })
        } | Should-Throw -ExceptionMessage '*lifecycle result*'
      }
    }

    It 'Should reject a success record with mismatched <Field>' `
      -ForEach $successMismatchCases {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
        Field = $Field
        Value = $Value
      } -ScriptBlock {
        $Contracts.SuccessRecord.$Field = $Value

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult $Contracts.Result
        } | Should-Throw -ExceptionMessage '*does not match*'
      }
    }

    It 'Should reject a failure record with mismatched <Field>' `
      -ForEach $failureMismatchCases {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
        Field = $Field
        Value = $Value
      } -ScriptBlock {
        $Contracts.FailureRecord.$Field = $Value

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $Contracts.Failure
        } | Should-Throw -ExceptionMessage '*does not match*'
      }
    }

    It 'Should reject an untyped failure target' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        $failure = [System.Management.Automation.ErrorRecord]::new(
          [System.InvalidOperationException]::new('failure'),
          'UntypedFailure',
          [System.Management.Automation.ErrorCategory]::OperationStopped,
          [System.Management.Automation.PSObject]@{ Phase = 'running-wait' }
        )

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $failure
        } | Should-Throw -ExceptionMessage '*does not match*'
      }
    }

    It 'Should reject a failure without a target contract' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        $failure = [System.Management.Automation.ErrorRecord]::new(
          [System.InvalidOperationException]::new('failure'),
          'MalformedFailure',
          [System.Management.Automation.ErrorCategory]::OperationStopped,
          $null
        )

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $failure
        } | Should-Throw -ExceptionMessage '*does not match*'
      }
    }
  }

  Context 'When the diagnostic helper unexpectedly terminates' {
    BeforeAll {
      Mock -CommandName Write-AzureDevLifecycleLogRecord -MockWith {
        throw 'unexpected diagnostic helper failure'
      }
    }

    It 'Should preserve success under terminating-warning preference' {
      $script:mockLockHeld = $false

      $output = InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        return @(
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult $Contracts.Result `
            -WarningAction Stop 3>&1
        )
      }

      $result = @($output | Where-Object {
          $_.PSObject.TypeNames[0] -eq 'AzureDev.LifecycleResult'
        })
      $result.Result | Should-Be 'running'
      @($output | Where-Object {
          $_ -is [System.Management.Automation.WarningRecord]
        }).Count | Should-Be 1
    }

    It 'Should rethrow the primary error under terminating-warning preference' {
      {
        InModuleScope -Parameters @{
          Contracts = $script:completionContracts
          RepositoryRoot = $TestDrive
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $Contracts.Failure `
            -WarningAction Stop
        }
      } | Should-Throw -ExceptionMessage '*did not reach running*'
    }
  }
}
