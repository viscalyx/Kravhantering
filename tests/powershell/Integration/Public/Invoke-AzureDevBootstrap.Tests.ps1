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
  'Invoke-AzureDevBootstrap' `
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
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Bootstrap.psm1'
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
KRAV_AZURE_CODEX_RESULT={"targetVersion":"1.2.3","schemaVersion":1}
'@
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
  }

  Context 'When host bootstrap returns a noncanonical Codex result' {
    It 'Should reject the target at the public boundary' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
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

      {
        Invoke-AzureDevBootstrap -Context $context
      } | Should-Throw -ExceptionMessage (
        '*Azure host bootstrap returned a noncanonical Codex result*'
      )
    }
  }
}
