#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevInterruption' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Logging'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When an exception chain contains an interruption' {
    It 'Should recognize cancellation and pipeline-stop exceptions' {
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

        Test-AzureDevInterruption -ErrorObject $errorRecord |
          Should-BeTrue
      }
    }
  }

  Context 'When an exception chain has no interruption' {
    It 'Should reject ordinary failures' {
      $failure = [System.InvalidOperationException]::new('ordinary failure')

      Test-AzureDevInterruption -ErrorObject $failure | Should-BeFalse
    }
  }

  Context 'When the input is not an exception' {
    It 'Should reject the input' {
      Test-AzureDevInterruption -ErrorObject 'not-an-exception' |
        Should-BeFalse
    }
  }
}
