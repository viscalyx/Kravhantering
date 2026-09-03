#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Wait-AzureDevLifecycleLockRetry' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the retry duration is zero' {
    It 'Should return without success-stream output' {
      $result = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Wait-AzureDevLifecycleLockRetry -Duration ([System.TimeSpan]::Zero)
      }

      $result | Should-BeNull
    }
  }
}
