#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevAzureLifecycleInterruption' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Azure'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When an exception chain contains an interruption' {
    It 'Should recognize cancellation and pipeline-stop exceptions' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $cancellation = [System.InvalidOperationException]::new(
          'wrapper',
          [System.OperationCanceledException]::new('interrupted')
        )
        $pipelineStop = [System.InvalidOperationException]::new(
          'wrapper',
          [System.Management.Automation.PipelineStoppedException]::new()
        )

        Test-AzureDevAzureLifecycleInterruption `
          -ErrorObject $cancellation | Should-BeTrue
        Test-AzureDevAzureLifecycleInterruption `
          -ErrorObject $pipelineStop | Should-BeTrue
      }
    }
  }

  Context 'When an exception chain has no interruption' {
    It 'Should reject ordinary failures' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $failure = [System.InvalidOperationException]::new('ordinary failure')

        Test-AzureDevAzureLifecycleInterruption `
          -ErrorObject $failure | Should-BeFalse
      }
    }
  }
}
