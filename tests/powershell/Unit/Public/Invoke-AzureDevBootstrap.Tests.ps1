#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevBootstrap' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Bootstrap'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
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
      return $script:mockRemoteOutput
    }
  }

  BeforeEach {
    $script:mockRemoteOutput = $null
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
  }

  Context 'When authenticated SSH host trust has not been established' {
    It 'Should stop before bootstrap validation, preparation, or secret creation' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $false
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
        }
      }

      {
        Invoke-AzureDevBootstrap -Context $context
      } | Should-Throw -ExceptionMessage (
        '*authenticated SSH host trust has not been established*'
      )

      Should-NotInvoke -CommandName Test-AzureDevGitIdentity -Scope It
      Should-NotInvoke -CommandName Copy-AzureDevBootstrapFile -Scope It
      Should-NotInvoke `
        -CommandName Copy-AzureDevServiceEnvironmentFiles `
        -Scope It
      Should-NotInvoke -CommandName Invoke-AzureDevRemoteCommand -Scope It
    }
  }

  Context 'When host bootstrap returns one valid Codex target result' {
    BeforeEach {
      $script:mockRemoteOutput = @'
[krav-azure-bootstrap] host bootstrap completed
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
'@
    }

    It 'Should return the validated Codex target version' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        BootstrapPath = Join-Path (
          Join-Path $script:repositoryRoot 'scripts/azure-dev/templates'
        ) 'bootstrap-host.sh'
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = @()
          GitUserName = 'Ada Admin'
          GitUserEmail = 'ada@example.test'
          GitSshSigningPublicKey = ''
        }
      }

      $result = Invoke-AzureDevBootstrap -Context $context

      $result | Should-BeString -Expected '1.2.3'
    }
  }
}
