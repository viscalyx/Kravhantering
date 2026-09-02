#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Complete-AzureDevLifecycleAttempt' -Tag 'Unit' {
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
    }
    Mock -CommandName Add-Content -MockWith {
      if ($script:lockHeld) {
        throw 'record attempted while the lifecycle lock was held'
      }
    }
    Mock -CommandName Write-Warning
  }

  BeforeEach {
    $script:lockHeld = $true
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
      return [System.Management.Automation.PSObject]@{
        Result = $result
        SuccessRecord = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -LifecycleResult $result `
          -MutationAccepted $false `
          -ElapsedMilliseconds 30000
        Failure = New-AzureDevLifecycleErrorRecord `
          -Phase running-wait `
          -Message 'The VM did not reach running before the deadline.'
        FailureRecord = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Command start `
          -Failure (New-AzureDevLifecycleErrorRecord `
            -Phase running-wait `
            -Message 'The VM did not reach running before the deadline.') `
          -ObservedState starting `
          -Action joined-start `
          -MutationAccepted $false `
          -ElapsedMilliseconds 600000
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When a successful attempt completes after lock release' {
    It 'Should write once and preserve exactly one typed result' {
      $script:lockHeld = $false

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
      $script:lockHeld = $false

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
    It 'Should preserve the successful result and emit one warning' {
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
      $result.Result | Should-Be 'running'
      Should-Invoke -CommandName Write-Warning -Exactly -Times 1 -Scope It
    }

    It 'Should preserve the primary error and emit one warning' {
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
      Should-Invoke -CommandName Write-Warning -Exactly -Times 1 -Scope It
    }
  }

  Context 'When the completion contracts disagree' {
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

    It 'Should reject a success record for another terminal result' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        $otherResult = New-AzureDevLifecycleResult `
          -Command start `
          -Result already-running `
          -VmName 'krav-dev-vm' `
          -ObservedState running `
          -Action none

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.SuccessRecord `
            -LifecycleResult $otherResult
        } | Should-Throw -ExceptionMessage '*does not match*'
      }
    }

    It 'Should reject a failure record for another phase' {
      InModuleScope -Parameters @{
        Contracts = $script:completionContracts
        RepositoryRoot = $TestDrive
      } -ScriptBlock {
        $otherFailure = New-AzureDevLifecycleErrorRecord `
          -Phase outside-interference `
          -Message 'Another actor changed the VM state.'

        {
          Set-StrictMode -Version 1.0
          Complete-AzureDevLifecycleAttempt `
            -RepositoryRoot $RepositoryRoot `
            -Record $Contracts.FailureRecord `
            -Failure $otherFailure
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

    It 'Should preserve the successful result and downgrade the helper error' {
      $script:lockHeld = $false

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

      $result.Result | Should-Be 'running'
      Should-Invoke -CommandName Write-Warning -Exactly -Times 1 -Scope It
    }
  }
}
