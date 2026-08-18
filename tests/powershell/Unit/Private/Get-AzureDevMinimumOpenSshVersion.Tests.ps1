#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevMinimumOpenSshVersion' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Azure'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  It 'Should require the first compatible Microsoft Windows release' {
    $version = InModuleScope -ScriptBlock {
      Set-StrictMode -Version 1.0
      Get-AzureDevMinimumOpenSshVersion -Platform 'windows'
    }

    $version | Should-Be ([System.Version]::new(8, 6))
  }

  It 'Should require the upstream feature boundary on macOS' {
    $version = InModuleScope -ScriptBlock {
      Set-StrictMode -Version 1.0
      Get-AzureDevMinimumOpenSshVersion -Platform 'macos'
    }

    $version | Should-Be ([System.Version]::new(8, 5))
  }

  It 'Should require the upstream feature boundary on Linux' {
    $version = InModuleScope -ScriptBlock {
      Set-StrictMode -Version 1.0
      Get-AzureDevMinimumOpenSshVersion -Platform 'linux'
    }

    $version | Should-Be ([System.Version]::new(8, 5))
  }
}
