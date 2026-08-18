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
    Mock -CommandName Invoke-AzureDevRemoteCommand
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
}
