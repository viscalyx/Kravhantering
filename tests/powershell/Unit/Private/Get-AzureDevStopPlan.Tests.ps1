#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevStopPlan' -Tag 'Unit' {
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

  Context 'When the observed state has a successful stop outcome' {
    BeforeDiscovery {
      $stopCases = @(
        @{
          State = 'deallocated'
          Result = 'already-deallocated'
          Action = 'none'
          Submit = $false
        },
        @{
          State = 'deallocating'
          Result = 'already-requested'
          Action = 'none'
          Submit = $false
        },
        @{ State = 'starting'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true },
        @{ State = 'running'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true },
        @{ State = 'stopping'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true },
        @{ State = 'stopped-allocated'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true },
        @{ State = 'creating'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true },
        @{ State = 'unavailable'; Result = 'requested'; Action = 'deallocation-requested'; Submit = $true }
      )
    }

    It 'Should map <State> to its exact terminal decision' -ForEach $stopCases {
      InModuleScope -Parameters @{
        State = $State
        ExpectedResult = $Result
        ExpectedAction = $Action
        ExpectedSubmit = $Submit
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        $plan = Get-AzureDevStopPlan -ObservedState $State

        $plan.PSObject.TypeNames[0] | Should-Be 'AzureDev.StopPlan'
        $plan.Result | Should-Be $ExpectedResult
        $plan.Action | Should-Be $ExpectedAction
        $plan.SubmitDeallocation | Should-Be $ExpectedSubmit
        $plan.FailurePhase | Should-BeNull
      }
    }
  }

  Context 'When the observed state blocks stop' {
    BeforeDiscovery {
      $failureCases = @(
        @{ State = 'not-found'; Phase = 'not-found' },
        @{ State = 'unrecognized'; Phase = 'state-read' }
      )
    }

    It 'Should map <State> to the <Phase> failure phase' -ForEach $failureCases {
      InModuleScope -Parameters @{
        State = $State
        ExpectedPhase = $Phase
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        $plan = Get-AzureDevStopPlan -ObservedState $State

        $plan.PSObject.TypeNames[0] | Should-Be 'AzureDev.StopPlan'
        $plan.Result | Should-BeNull
        $plan.Action | Should-Be 'none'
        $plan.SubmitDeallocation | Should-BeFalse
        $plan.FailurePhase | Should-Be $ExpectedPhase
      }
    }
  }

  Context 'When the observed state is validated' {
    It 'Should accept a supported state without case sensitivity' {
      $plan = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevStopPlan -ObservedState 'RUNNING'
      }

      $plan.Result | Should-Be 'requested'
      $plan.SubmitDeallocation | Should-BeTrue
    }

    It 'Should reject a state outside the shared stop-state catalog' {
      {
        InModuleScope -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevStopPlan -ObservedState 'unknown-future-state'
        }
      } | Should-Throw -ExceptionMessage '*not supported*'
    }
  }
}
