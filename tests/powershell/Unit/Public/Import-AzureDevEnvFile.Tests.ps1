#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Import-AzureDevEnvFile' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Config'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When callers use the setup-oriented value contract' {
    It 'Should preserve string values and last-occurrence-wins behavior' {
      $path = Join-Path $TestDrive 'setup.env'
      Set-Content -LiteralPath $path -Value @'
AZURE_DEV_VM_NAME=first
AZURE_DEV_VM_NAME=second
'@

      $values = Import-AzureDevEnvFile -Path $path

      $values.AZURE_DEV_VM_NAME |
        Should-BeString -Expected 'second' -CaseSensitive
    }
  }

  Context 'When lifecycle callers request provenance' {
    It 'Should return the effective line without changing the value' {
      $path = Join-Path $TestDrive 'lifecycle.env'
      Set-Content -LiteralPath $path -Value @'
AZURE_DEV_VM_NAME=first
AZURE_DEV_VM_NAME=second
'@

      $values = Import-AzureDevEnvFile -Path $path -IncludeProvenance

      $values.AZURE_DEV_VM_NAME.Value |
        Should-BeString -Expected 'second' -CaseSensitive
      $values.AZURE_DEV_VM_NAME.Line | Should-Be 2
    }
  }

  Context 'When the dotenv syntax is malformed' {
    It 'Should fail at the file boundary' {
      $path = Join-Path $TestDrive 'malformed.env'
      Set-Content -LiteralPath $path -Value 'not an assignment'

      {
        Import-AzureDevEnvFile -Path $path
      } | Should-Throw -ExceptionMessage '*line 1*KEY=value syntax*'
    }
  }
}
