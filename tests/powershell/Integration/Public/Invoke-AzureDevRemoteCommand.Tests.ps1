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
  'Invoke-AzureDevRemoteCommand' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Bootstrap'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
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

    Mock -CommandName Assert-AzureDevSshHostTrust
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      return [System.Management.Automation.PSObject]@{
        ExitCode = 0
        Text = "first line`nsecond line`n"
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the remote boundary returns multiline output' {
    It 'Should preserve the complete output for the caller' {
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
        }
      }

      $result = Invoke-AzureDevRemoteCommand `
        -Context $context `
        -Command 'bootstrap-command' `
        -PassThru

      $result | Should-BeString -Expected "first line`nsecond line`n"
    }
  }
}
