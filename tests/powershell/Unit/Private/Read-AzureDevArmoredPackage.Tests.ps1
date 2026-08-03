#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Read-AzureDevArmoredPackage' -Tag 'Unit' {
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

  Context 'When the armor is malformed' {
    It 'Should reject it with regeneration guidance' {
      $path = Join-Path $TestDrive 'malformed.kravpkg'
      Set-Content -LiteralPath $path -Value 'not an envelope'

      {
        InModuleScope -Parameters @{ Path = $path } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Read-AzureDevArmoredPackage -Path $Path
        }
      } | Should-Throw -ExceptionMessage '*regenerated .kravpkg response*'
    }
  }
}
