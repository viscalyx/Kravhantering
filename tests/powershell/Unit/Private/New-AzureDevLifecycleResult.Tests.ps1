#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleResult' -Tag 'Unit' {
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
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When a terminal outcome is permitted' {
    BeforeDiscovery {
      $resultCases = @(
        @{
          Command = 'start'
          ExpectedResult = 'running'
          State = 'running'
          Action = 'joined-start'
        },
        @{
          Command = 'start'
          ExpectedResult = 'running'
          State = 'running'
          Action = 'start-requested'
        },
        @{
          Command = 'start'
          ExpectedResult = 'already-running'
          State = 'running'
          Action = 'none'
        },
        @{
          Command = 'stop'
          ExpectedResult = 'requested'
          State = 'unavailable'
          Action = 'deallocation-requested'
        },
        @{
          Command = 'stop'
          ExpectedResult = 'already-requested'
          State = 'deallocating'
          Action = 'none'
        },
        @{
          Command = 'stop'
          ExpectedResult = 'already-deallocated'
          State = 'deallocated'
          Action = 'none'
        }
      )
    }

    It 'Should return exactly the typed contract for <Command> <ExpectedResult>' `
      -ForEach $resultCases {
      InModuleScope -Parameters $_ -ScriptBlock {
        Set-StrictMode -Version 1.0
        $result = New-AzureDevLifecycleResult `
          -Command $Command `
          -Result $ExpectedResult `
          -VmName 'krav-dev-vm' `
          -ObservedState $State `
          -Action $Action

        $result.PSObject.TypeNames[0] |
          Should-Be 'AzureDev.LifecycleResult'
        @($result.PSObject.Properties.Name) |
          Should-BeCollection @(
            'Command',
            'Result',
            'VmName',
            'ObservedState',
            'Action'
          )
        $result.Command | Should-Be $Command
        $result.Result | Should-Be $ExpectedResult
        $result.VmName | Should-Be 'krav-dev-vm'
        $result.ObservedState | Should-Be $State
        $result.Action | Should-Be $Action
      }
    }
  }

  Context 'When a field or field combination is not permitted' {
    It 'Should reject a cross-command terminal outcome' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleResult `
            -Command stop `
            -Result running `
            -VmName 'krav-dev-vm' `
            -ObservedState running `
            -Action joined-start
        } | Should-Throw -ExceptionMessage '*not valid for command*'
      }
    }

    It 'Should reject an unrecognized state as a successful stop outcome' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleResult `
            -Command stop `
            -Result requested `
            -VmName 'krav-dev-vm' `
            -ObservedState unrecognized `
            -Action deallocation-requested
        } | Should-Throw -ExceptionMessage '*not valid for command*'
      }
    }
  }

  Context 'When discriminators use noncanonical casing' {
    It 'Should normalize command, result, state, and action to lowercase' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $result = New-AzureDevLifecycleResult `
          -Command START `
          -Result RUNNING `
          -VmName 'Krav-Dev-VM' `
          -ObservedState RUNNING `
          -Action JOINED-START

        $result.Command | Should-Be 'start'
        $result.Result | Should-Be 'running'
        $result.VmName | Should-Be 'Krav-Dev-VM'
        $result.ObservedState | Should-Be 'running'
        $result.Action | Should-Be 'joined-start'
      }
    }
  }
}
