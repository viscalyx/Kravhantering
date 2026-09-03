#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevStopPreviewAction' -Tag 'Unit' {
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

  Context 'When stop is previewed without live state' {
    It 'Should derive every conditional rule from the normalized stop planner' {
      $action = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevStopPreviewAction
      }

      $action | Should-MatchString 'deallocated => already-deallocated:none'
      $action | Should-MatchString 'deallocating => already-requested:none'
      $action | Should-MatchString (
        'unavailable => requested:deallocation-requested'
      )
      $action | Should-MatchString 'not-found => fail:not-found'
      $action | Should-MatchString 'unrecognized => fail:state-read'
    }
  }
}
