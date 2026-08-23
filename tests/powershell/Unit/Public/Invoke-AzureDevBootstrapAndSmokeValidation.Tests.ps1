#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevBootstrapAndSmokeValidation' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Validation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
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

  Context 'When smoke validation is enabled' {
    It 'Should pass the bootstrap target unchanged to smoke validation' {
      $context = [System.Management.Automation.PSObject]@{
        SkipSmokeValidation = $false
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
        }
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

  Context 'When smoke validation is skipped' {
    It 'Should complete bootstrap without invoking smoke validation' {
      $context = [System.Management.Automation.PSObject]@{
        SkipSmokeValidation = $true
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
        }
      }

      $result = Invoke-AzureDevBootstrapAndSmokeValidation -Context $context

      $result | Should-BeString -Expected 'skipped'
      Should-NotInvoke `
        -CommandName Invoke-AzureDevSmokeValidation `
        -Scope It
    }
  }

  Context 'When WhatIf is requested' {
    It 'Should not start bootstrap or smoke validation' {
      $context = [System.Management.Automation.PSObject]@{
        SkipSmokeValidation = $false
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
        }
      }

      $result = Invoke-AzureDevBootstrapAndSmokeValidation `
        -Context $context `
        -WhatIf

      $result | Should-BeNull
      Should-NotInvoke -CommandName Invoke-AzureDevBootstrap -Scope It
      Should-NotInvoke `
        -CommandName Invoke-AzureDevSmokeValidation `
        -Scope It
    }
  }
}
