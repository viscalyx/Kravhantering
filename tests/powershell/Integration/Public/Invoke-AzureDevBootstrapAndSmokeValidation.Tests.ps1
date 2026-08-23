#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe `
  'Invoke-AzureDevBootstrapAndSmokeValidation' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Validation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Bootstrap.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Validation.psm1'
    ) -Force -ErrorAction Stop

    Mock -CommandName Invoke-AzureDevBootstrap -MockWith { return '1.2.3' }
    Mock -CommandName Invoke-AzureDevSmokeValidation
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Bootstrap' -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When bootstrap and smoke run through the setup orchestration seam' {
    It 'Should preserve the machine-readable target across both public commands' {
      $context = [System.Management.Automation.PSObject]@{
        SkipSmokeValidation = $false
      }

      $result = Invoke-AzureDevBootstrapAndSmokeValidation -Context $context

      $result | Should-BeString -Expected 'passed'
      Should-Invoke `
        -CommandName Invoke-AzureDevSmokeValidation `
        -ParameterFilter {
          $Context -eq $context -and $ExpectedCodexVersion -ceq '1.2.3'
        } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
