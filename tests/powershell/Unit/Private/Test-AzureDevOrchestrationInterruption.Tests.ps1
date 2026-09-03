#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevOrchestrationInterruption' -Tag 'Unit' {
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

  Context 'When an error record wraps an interruption' {
    It 'Should inspect inner cancellation and pipeline-stop exceptions' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        foreach ($interruption in @(
            [System.OperationCanceledException]::new('interrupted'),
            [System.Management.Automation.PipelineStoppedException]::new()
          )) {
          $wrapper = [System.InvalidOperationException]::new(
            'wrapper',
            $interruption
          )
          $errorRecord = [System.Management.Automation.ErrorRecord]::new(
            $wrapper,
            'wrapped',
            [System.Management.Automation.ErrorCategory]::OperationStopped,
            $null
          )

          Test-AzureDevOrchestrationInterruption `
            -ErrorObject $errorRecord | Should-BeTrue
        }
      }
    }
  }

  Context 'When an error record wraps an ordinary failure' {
    It 'Should report that execution was not interrupted' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $errorRecord = [System.Management.Automation.ErrorRecord]::new(
          [System.InvalidOperationException]::new('ordinary failure'),
          'ordinary',
          [System.Management.Automation.ErrorCategory]::OperationStopped,
          $null
        )

        Test-AzureDevOrchestrationInterruption `
          -ErrorObject $errorRecord | Should-BeFalse
      }
    }
  }
}
