#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevPublicKeyFingerprint' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Workstation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Workstation.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  Context 'When validating a fingerprint' {
    It 'Should accept a canonical SHA-256 SSH fingerprint' {
      $result = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevPublicKeyFingerprint `
          -Fingerprint 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      }

      $result | Should-BeTrue
    }

    It 'Should reject a truncated fingerprint' {
      $result = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevPublicKeyFingerprint -Fingerprint 'SHA256:short'
      }

      $result | Should-BeFalse
    }
  }
}
