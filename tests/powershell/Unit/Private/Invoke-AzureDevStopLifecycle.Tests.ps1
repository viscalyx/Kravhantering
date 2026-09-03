#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevStopLifecycle' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($module in @(
        'AzureDev.Logging.psm1',
        'AzureDev.Azure.psm1',
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
    $script:configuration = [System.Management.Automation.PSObject]@{
      SubscriptionId = '11111111-1111-1111-1111-111111111111'
      ResourceGroup = 'integration-rg'
      VmName = 'integration-vm'
    }
    $script:configuration.PSObject.TypeNames.Insert(
      0,
      'AzureDev.LifecycleConfigurationSnapshot'
    )
    Mock Connect-AzureDevLifecycleSession -MockWith {
      if ($null -ne $script:mockAuthenticationFailure) {
        throw $script:mockAuthenticationFailure
      }
      return $true
    }
    Mock Get-AzureDevLifecycleState -MockWith {
      if ($null -ne $script:mockStateReadFailure) {
        throw $script:mockStateReadFailure
      }
      return $script:mockObservedStopState
    }
    Mock Invoke-AzCli -MockWith {
      if ($null -ne $script:mockSubmissionFailure) {
        throw $script:mockSubmissionFailure
      }
    }
  }

  BeforeEach {
    $script:mockAuthenticationFailure = $null
    $script:mockStateReadFailure = $null
    $script:mockObservedStopState = 'running'
    $script:mockSubmissionFailure = $null
  }

  AfterAll {
    @(
      'AzureDev.Lifecycle',
      'AzureDev.Azure',
      'AzureDev.Logging'
    ) | ForEach-Object {
      Get-Module $_ -All | Remove-Module -Force
    }
  }

  Context 'When deallocation has already converged or is in progress' {
    BeforeDiscovery {
      $idempotentCases = @(
        @{ State = 'deallocated'; Result = 'already-deallocated' },
        @{ State = 'deallocating'; Result = 'already-requested' }
      )
    }

    It 'Should return <Result> from <State> without mutation' `
      -ForEach $idempotentCases {
      $expectedResult = $Result
      $script:mockObservedStopState = $State

      $information = @()
      $result = InModuleScope -Parameters @{
        Configuration = $script:configuration
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevStopLifecycle `
          -Configuration $Configuration `
          -InformationVariable information
      }

      $result.PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      $result.Command | Should-Be 'stop'
      $result.Result | Should-Be $expectedResult
      $result.VmName | Should-Be 'integration-vm'
      $result.ObservedState | Should-Be $State
      $result.Action | Should-Be 'none'
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 1 -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
    }
  }

  Context 'When a state requires the cost-control mutation' {
    BeforeDiscovery {
      $mutationCases = @(
        @{ State = 'starting' },
        @{ State = 'running' },
        @{ State = 'stopping' },
        @{ State = 'stopped-allocated' },
        @{ State = 'creating' },
        @{ State = 'unavailable' }
      )
    }

    It 'Should submit exactly one targeted asynchronous deallocation from <State>' `
      -ForEach $mutationCases {
      $script:mockObservedStopState = $State

      $result = InModuleScope -Parameters @{
        Configuration = $script:configuration
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevStopLifecycle -Configuration $Configuration
      }

      $result.Command | Should-Be 'stop'
      $result.Result | Should-Be 'requested'
      $result.VmName | Should-Be 'integration-vm'
      $result.ObservedState | Should-Be $State
      $result.Action | Should-Be 'deallocation-requested'
      Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $TimeoutSeconds -eq 120 -and
          $SuppressOutputDetails -and
          $Arguments.Count -eq 12 -and
          $Arguments[0] -ceq 'vm' -and
          $Arguments[1] -ceq 'deallocate' -and
          $Arguments[2] -ceq '--subscription' -and
          $Arguments[3] -ceq $script:configuration.SubscriptionId -and
          $Arguments[4] -ceq '--resource-group' -and
          $Arguments[5] -ceq $script:configuration.ResourceGroup -and
          $Arguments[6] -ceq '--name' -and
          $Arguments[7] -ceq $script:configuration.VmName -and
          $Arguments[8] -ceq '--no-wait' -and
          $Arguments[9] -ceq '--output' -and
          $Arguments[10] -ceq 'none' -and
          $Arguments[11] -ceq '--only-show-errors'
        }
    }
  }

  Context 'When the deallocation mutation is denied' {
    It 'Should authenticate and observe but submit nothing and return no result' {
      $result = @(
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Invoke-AzureDevStopLifecycle `
            -Configuration $Configuration `
            -WhatIf
        }
      )

      $result.Count | Should-Be 0
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 1 -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
    }
  }

  Context 'When authentication repair is declined' {
    BeforeEach {
      Mock Connect-AzureDevLifecycleSession -MockWith { return $false }
    }

    It 'Should return no result without reading state or submitting deallocation' {
      $result = @(
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      )

      $result.Count | Should-Be 0
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
    }
  }

  Context 'When a decisive stop stage fails' {
    It 'Should classify authentication failure without reading state or mutating' {
      $script:mockAuthenticationFailure = 'authentication rejected'

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.TargetObject.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleFailure'
      $captured.TargetObject.Phase | Should-Be 'authentication'
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
    }

    It 'Should classify an unexpected state-read failure without mutation' {
      $script:mockStateReadFailure = 'state boundary failed'

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.TargetObject.Phase | Should-Be 'state-read'
      Should-NotInvoke Invoke-AzCli -Scope It
    }

    It 'Should classify definite absence without mutation' {
      $script:mockObservedStopState = 'not-found'

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.TargetObject.Phase | Should-Be 'not-found'
      $captured.TargetObject.ObservedState | Should-Be 'not-found'
      $captured.TargetObject.Action | Should-Be 'none'
      Should-NotInvoke Invoke-AzCli -Scope It
    }

    It 'Should classify unrecognized state as a state-read failure' {
      $script:mockObservedStopState = 'unrecognized'

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.TargetObject.Phase | Should-Be 'state-read'
      $captured.TargetObject.ObservedState | Should-Be 'unrecognized'
      Should-NotInvoke Invoke-AzCli -Scope It
    }

    It 'Should classify a rejected submission and expose no result' {
      $script:mockSubmissionFailure = 'deallocation rejected'

      $captured = $null
      $result = @()
      try {
        $result = @(
          InModuleScope -Parameters @{
            Configuration = $script:configuration
          } -ScriptBlock {
            Set-StrictMode -Version 1.0
            Invoke-AzureDevStopLifecycle -Configuration $Configuration
          }
        )
      } catch {
        $captured = $_
      }

      $result.Count | Should-Be 0
      $captured.TargetObject.Phase | Should-Be 'deallocation-submission'
      $captured.TargetObject.ObservedState | Should-Be 'running'
      $captured.TargetObject.Action | Should-Be 'deallocation-requested'
      $captured.TargetObject.MutationAccepted | Should-BeFalse
      Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It
    }
  }

  Context 'When a decisive stop stage is interrupted' {
    BeforeDiscovery {
      $interruptionCases = @(
        @{ Stage = 'authentication' },
        @{ Stage = 'state-read' },
        @{ Stage = 'submission' }
      )
    }

    It 'Should propagate <Stage> cancellation without a later mutation' `
      -ForEach $interruptionCases {
      $interruption = [System.InvalidOperationException]::new(
        'wrapped interruption',
        [System.OperationCanceledException]::new('interrupted')
      )
      switch ($Stage) {
        'authentication' {
          $script:mockAuthenticationFailure = $interruption
        }
        'state-read' {
          $script:mockStateReadFailure = $interruption
        }
        'submission' {
          $script:mockSubmissionFailure = $interruption
        }
      }

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopLifecycle -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.Exception.Message | Should-Be 'wrapped interruption'
      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      if ($Stage -in @('authentication', 'state-read')) {
        Should-NotInvoke Invoke-AzCli -Scope It
      } else {
        Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It
      }
    }
  }

  Context 'When stop uses a non-default Azure deadline' {
    It 'Should apply it to authentication, state observation, and submission' {
      $result = InModuleScope -Parameters @{
        Configuration = $script:configuration
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevStopLifecycle `
          -Configuration $Configuration `
          -AzureCallTimeoutSeconds 7
      }

      $result.Result | Should-Be 'requested'
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 7 }
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 7 }
      Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 7 }
    }
  }
}
