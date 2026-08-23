#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevRemoteCommand' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Bootstrap'
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

    Mock -CommandName Assert-AzureDevSshHostTrust
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      return [System.Management.Automation.PSObject]@{
        ExitCode = 0
        Text = 'remote output'
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When pass-through output is requested' {
    It 'Should return the exact remote command output' {
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
        }
      }

      $result = Invoke-AzureDevRemoteCommand `
        -Context $context `
        -Command 'printf remote-output' `
        -PassThru

      $result | Should-BeString -Expected 'remote output'
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter {
          $FilePath -eq 'ssh' -and
          $Arguments[-2] -eq 'krav-test' -and
          $Arguments[-1] -eq 'printf remote-output'
        } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
