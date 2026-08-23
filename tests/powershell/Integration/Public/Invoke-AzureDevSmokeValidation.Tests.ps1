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
  'Invoke-AzureDevSmokeValidation' `
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
    It 'Should complete through the isolated remote boundary' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
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
          $FilePath -eq 'ssh'
        } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
