#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevStartPlan' -Tag 'Unit' {
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

  Context 'When the decisive state is stable or moving upward' {
    BeforeDiscovery {
      $planCases = @(
        @{
          State = 'running'
          Decision = 'complete'
          Result = 'already-running'
          Action = 'none'
          Mutation = $false
          Wait = $false
        },
        @{
          State = 'starting'
          Decision = 'wait-running'
          Result = 'running'
          Action = 'joined-start'
          Mutation = $false
          Wait = $true
        },
        @{
          State = 'stopped-allocated'
          Decision = 'start'
          Result = 'running'
          Action = 'start-requested'
          Mutation = $true
          Wait = $true
        },
        @{
          State = 'deallocated'
          Decision = 'start'
          Result = 'running'
          Action = 'start-requested'
          Mutation = $true
          Wait = $true
        }
      )
    }

    It 'Should plan <State> as <Decision>' -ForEach $planCases {
      InModuleScope -Parameters $_ -ScriptBlock {
        Set-StrictMode -Version 1.0
        $plan = New-AzureDevStartPlan -ObservedState $State

        $plan.PSObject.TypeNames[0] | Should-Be 'AzureDev.StartPlan'
        $plan.Decision | Should-Be $Decision
        $plan.Result | Should-Be $Result
        $plan.Action | Should-Be $Action
        $plan.SubmitMutation | Should-Be $Mutation
        $plan.WaitForRunning | Should-Be $Wait
        $plan.FailurePhase | Should-BeNull
      }
    }
  }

  Context 'When the decisive state blocks start' {
    BeforeDiscovery {
      $blockedCases = @(
        @{ State = 'not-found'; Phase = 'not-found' },
        @{ State = 'unavailable'; Phase = 'state-read' },
        @{ State = 'creating'; Phase = 'state-read' },
        @{ State = 'unrecognized'; Phase = 'state-read' }
      )
    }

    It 'Should fail <State> without a mutation' -ForEach $blockedCases {
      InModuleScope -Parameters $_ -ScriptBlock {
        Set-StrictMode -Version 1.0
        $plan = New-AzureDevStartPlan -ObservedState $State

        $plan.Decision | Should-Be 'fail'
        $plan.SubmitMutation | Should-BeFalse
        $plan.WaitForRunning | Should-BeFalse
        $plan.FailurePhase | Should-Be $Phase
        $plan.FailureMessage | Should-MatchString $State
      }
    }
  }

  Context 'When the decisive state is moving downward' {
    BeforeDiscovery {
      $downwardCases = @(
        @{ State = 'stopping' },
        @{ State = 'deallocating' }
      )
    }

    It 'Should reserve <State> for stable-stop convergence' `
      -ForEach $downwardCases {
      InModuleScope -Parameters $_ -ScriptBlock {
        Set-StrictMode -Version 1.0
        $plan = New-AzureDevStartPlan -ObservedState $State

        $plan.Decision | Should-Be 'wait-stable-stop'
        $plan.SubmitMutation | Should-BeFalse
        $plan.WaitForRunning | Should-BeFalse
      }
    }
  }
}
