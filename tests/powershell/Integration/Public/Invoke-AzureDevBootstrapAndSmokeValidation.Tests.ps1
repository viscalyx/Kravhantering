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
      'Mock:ModuleName' = 'AzureDev.Bootstrap'
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

    Mock -CommandName Test-AzureDevGitIdentity
    Mock -CommandName Copy-AzureDevBootstrapFile
    Mock -CommandName Copy-AzureDevQuadletFiles
    Mock -CommandName Copy-AzureDevZshTemplate
    Mock -CommandName Copy-AzureDevDevelopmentToolFiles
    Mock -CommandName Copy-AzureDevServiceEnvironmentFiles
    Mock -CommandName Invoke-AzureDevRemoteCommand -MockWith {
      return @'
[krav-azure-bootstrap] host bootstrap completed
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
'@
    }
    $PSDefaultParameterValues['Mock:ModuleName'] = $script:moduleName
    Mock -CommandName Invoke-AzureDevSmokeValidation
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Bootstrap' -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When bootstrap and smoke run through the setup orchestration seam' {
    It 'Should carry the parsed target through both public command boundaries' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        SkipSmokeValidation = $false
        BootstrapPath = Join-Path (
          Join-Path $script:repositoryRoot 'scripts/azure-dev/templates'
        ) 'bootstrap-host.sh'
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
          GitUserName = 'Ada Admin'
          GitUserEmail = 'ada@example.test'
          GitSshSigningPublicKey = ''
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
}
