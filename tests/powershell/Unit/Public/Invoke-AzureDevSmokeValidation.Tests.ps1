#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevSmokeValidation' -Tag 'Unit' {
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

    Mock -CommandName Assert-AzureDevSshHostTrust
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      return [System.Management.Automation.PSObject]@{
        ExitCode = 0
        Text = ''
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Bootstrap' -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When smoke validation receives the bootstrap target' {
    It 'Should run the remote validation successfully' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = @()
          GitUserName = 'Ada Admin'
          GitUserEmail = 'ada@example.test'
          GitSshSigningPublicKey = ''
        }
      }

      $null = Invoke-AzureDevSmokeValidation `
        -Context $context `
        -ExpectedCodexVersion '1.2.3'

      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter {
          $FilePath -eq 'ssh' -and
          $Arguments[-1] -match ' 1\.2\.3$'
        } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
