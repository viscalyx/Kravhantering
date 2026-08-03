#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'ConvertTo-AzureDevArmoredPackage' -Tag 'Unit' {
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

  Context 'When armoring a signed package' {
    It 'Should emit one schema 3 ASCII envelope' {
      $result = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        ConvertTo-AzureDevArmoredPackage `
          -Payload ([System.Text.Encoding]::ASCII.GetBytes('ciphertext')) `
          -Signature @'
-----BEGIN SSH SIGNATURE-----
U0lHTkFUVVJF
-----END SSH SIGNATURE-----
'@ `
          -ApproverPublicKeyFingerprint (
            'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
          )
      }

      $result.StartsWith(
        '-----BEGIN KRAVHANTERING WORKSTATION PACKAGE-----'
      ) | Should-BeTrue
      $result.Contains('Version: 3') | Should-BeTrue
      $result.EndsWith(
        '-----END KRAVHANTERING WORKSTATION PACKAGE-----'
      ) | Should-BeTrue
    }
  }
}
