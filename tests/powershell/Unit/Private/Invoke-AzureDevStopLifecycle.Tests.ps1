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
  }

  BeforeEach {
    Mock Connect-AzureDevLifecycleSession
    Mock Get-AzureDevLifecycleState -MockWith { return 'running' }
    Mock Invoke-AzCli
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
      Mock Get-AzureDevLifecycleState -MockWith { return $State }

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
      $expectedState = $State
      Mock Get-AzureDevLifecycleState -MockWith { return $expectedState }

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

  Context 'When a decisive stop stage fails' {
    It 'Should classify authentication failure without reading state or mutating' {
      Mock Connect-AzureDevLifecycleSession -MockWith {
        throw 'authentication rejected'
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

      $captured.TargetObject.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleFailure'
      $captured.TargetObject.Phase | Should-Be 'authentication'
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
    }

    It 'Should classify an unexpected state-read failure without mutation' {
      Mock Get-AzureDevLifecycleState -MockWith { throw 'state boundary failed' }

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
      Mock Get-AzureDevLifecycleState -MockWith { return 'not-found' }

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
      Mock Get-AzureDevLifecycleState -MockWith { return 'unrecognized' }

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
      Mock Invoke-AzCli -MockWith { throw 'deallocation rejected' }

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
}
