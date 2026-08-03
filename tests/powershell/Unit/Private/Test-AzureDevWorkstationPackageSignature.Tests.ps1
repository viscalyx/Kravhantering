#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevWorkstationPackageSignature' -Tag 'Unit' {
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

  Context 'When the encrypted payload is empty' {
    It 'Should reject it before starting native verification' {
      $result = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevWorkstationPackageSignature `
          -Payload ([System.Byte[]]@()) `
          -Signature 'unused' `
          -PublicKey 'unused'
      }

      $result | Should-BeFalse
    }
  }
}
