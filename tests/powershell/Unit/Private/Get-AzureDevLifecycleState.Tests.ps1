#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevLifecycleState' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }
    $script:configuration = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        SubscriptionId = '11111111-1111-1111-1111-111111111111'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
      }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When Azure returns a recognized power-state code' {
    BeforeDiscovery {
      $stateCases = @(
        @{ Raw = 'PowerState/starting'; Expected = 'starting' },
        @{ Raw = 'PowerState/running'; Expected = 'running' },
        @{ Raw = 'PowerState/stopping'; Expected = 'stopping' },
        @{ Raw = 'PowerState/stopped'; Expected = 'stopped-allocated' },
        @{ Raw = 'PowerState/deallocating'; Expected = 'deallocating' },
        @{ Raw = 'PowerState/deallocated'; Expected = 'deallocated' },
        @{ Raw = 'PowerState/creating'; Expected = 'creating' }
      )
    }

    Context 'When Azure returns <Raw>' -ForEach $stateCases {
      BeforeAll {
        Mock Invoke-AzCli -MockWith { return $Raw }
      }

      It 'Should normalize the power-state code as <Expected>' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
          Expected = $Expected
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $state = Get-AzureDevLifecycleState -Configuration $Configuration

          $state | Should-Be $Expected
        }
        Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
          -ParameterFilter {
            $TimeoutSeconds -eq 120 -and
            $SuppressOutputDetails -and
            $Arguments.Count -eq 13 -and
            $Arguments[0] -ceq 'vm' -and
            $Arguments[1] -ceq 'get-instance-view' -and
            $Arguments[3] -ceq $script:configuration.SubscriptionId -and
            $Arguments[5] -ceq $script:configuration.ResourceGroup -and
            $Arguments[7] -ceq $script:configuration.VmName -and
            $Arguments[9] -ceq (
              "instanceView.statuses[?starts_with(code, 'PowerState/')]" +
              '.code | [0]'
            ) -and
            $Arguments[10] -ceq '--output' -and
            $Arguments[11] -ceq 'tsv' -and
            $Arguments[12] -ceq '--only-show-errors'
          }
      }
    }
  }

  Context 'When Azure returns no supported power-state code' {
    BeforeDiscovery {
      $stateCases = @(
        @{ Raw = $null; Expected = 'unavailable' },
        @{ Raw = ''; Expected = 'unavailable' },
        @{ Raw = 'PowerState/unknown'; Expected = 'unrecognized' },
        @{ Raw = 'unexpected'; Expected = 'unrecognized' }
      )
    }

    Context 'When Azure returns <Raw>' -ForEach $stateCases {
      BeforeAll {
        Mock Invoke-AzCli -MockWith { return $Raw }
      }

      It 'Should preserve the distinct <Expected> observation' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
          Expected = $Expected
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $state = Get-AzureDevLifecycleState -Configuration $Configuration

          $state | Should-Be $Expected
        }
      }
    }
  }

  Context 'When the targeted state read fails' {
    Context 'When Azure reports that the target is absent' {
      BeforeAll {
        Mock Invoke-AzCli -MockWith {
          $mockException = [System.InvalidOperationException]::new(
            'The targeted VM was not found.'
          )
          $mockException.Data['AzureDevCliExitCode'] = 3
          throw $mockException
        }
      }

      It 'Should preserve definite absence separately from an unavailable read' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $state = Get-AzureDevLifecycleState -Configuration $Configuration

          $state | Should-Be 'not-found'
        }
      }
    }

    Context 'When Azure reports another state-read failure' {
      BeforeAll {
        Mock Invoke-AzCli -MockWith {
          $mockException = [System.InvalidOperationException]::new(
            'The targeted state read failed.'
          )
          $mockException.Data['AzureDevCliExitCode'] = 1
          throw $mockException
        }
      }

      It 'Should report the state-read failure as unavailable' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $state = Get-AzureDevLifecycleState -Configuration $Configuration

          $state | Should-Be 'unavailable'
        }
      }
    }

    Context 'When the state read is interrupted' {
      BeforeAll {
        Mock Invoke-AzCli -MockWith {
          $inner = [System.OperationCanceledException]::new('interrupted')
          throw [System.InvalidOperationException]::new('wrapper', $inner)
        }
      }

      It 'Should propagate cancellation instead of reporting unavailable' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          {
            Get-AzureDevLifecycleState -Configuration $Configuration
          } | Should-Throw -ExceptionMessage '*wrapper*'
        }
      }
    }

    Context 'When the state read uses a non-default deadline' {
      BeforeAll {
        Mock Invoke-AzCli -MockWith { return 'PowerState/running' }
      }

      It 'Should pass the caller timeout to the Azure CLI boundary' {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $state = Get-AzureDevLifecycleState `
            -Configuration $Configuration `
            -TimeoutSeconds 9

          $state | Should-Be 'running'
        }
        Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
          -ParameterFilter { $TimeoutSeconds -eq 9 }
      }
    }
  }
}
