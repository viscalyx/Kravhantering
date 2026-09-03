#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'ConvertTo-AzureDevLifecycleTimeoutSeconds' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When a millisecond deadline includes a partial second' {
    It 'Should round up without shortening the deadline' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $seconds = ConvertTo-AzureDevLifecycleTimeoutSeconds `
          -Milliseconds 2301 `
          -MaximumSeconds 10

        $seconds | Should-Be 3
      }
    }
  }

  Context 'When the converted deadline exceeds the consumer limit' {
    It 'Should reject the unsupported timeout' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        {
          ConvertTo-AzureDevLifecycleTimeoutSeconds `
            -Milliseconds 10001 `
            -MaximumSeconds 10
        } | Should-Throw -ExceptionMessage '*exceeds the supported maximum*'
      }
    }
  }
}
