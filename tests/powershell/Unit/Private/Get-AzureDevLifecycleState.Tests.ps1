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
    $script:configuration = [pscustomobject]@{
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

    It 'Should normalize <Raw> as <Expected>' -ForEach $stateCases {
      Mock Invoke-AzCli -MockWith { return $Raw }

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

  Context 'When Azure returns no supported power-state code' {
    BeforeDiscovery {
      $stateCases = @(
        @{ Raw = $null; Expected = 'unavailable' },
        @{ Raw = ''; Expected = 'unavailable' },
        @{ Raw = 'PowerState/unknown'; Expected = 'unrecognized' },
        @{ Raw = 'unexpected'; Expected = 'unrecognized' }
      )
    }

    It 'Should preserve the distinct <Expected> observation' `
      -ForEach $stateCases {
      Mock Invoke-AzCli -MockWith { return $Raw }

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

  Context 'When the targeted state read fails' {
    It 'Should preserve definite absence separately from an unavailable read' {
      Mock Invoke-AzCli -MockWith {
        throw 'az vm get-instance-view failed with exit code 3.'
      }

      InModuleScope -Parameters @{
        Configuration = $script:configuration
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        $state = Get-AzureDevLifecycleState -Configuration $Configuration

        $state | Should-Be 'not-found'
      }
    }

    It 'Should report other state-read failures as unavailable' {
      Mock Invoke-AzCli -MockWith {
        throw 'az vm get-instance-view failed with exit code 1.'
      }

      InModuleScope -Parameters @{
        Configuration = $script:configuration
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        $state = Get-AzureDevLifecycleState -Configuration $Configuration

        $state | Should-Be 'unavailable'
      }
    }
  }
}
