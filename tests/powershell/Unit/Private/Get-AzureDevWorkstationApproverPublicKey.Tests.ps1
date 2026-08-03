#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevWorkstationApproverPublicKey' -Tag 'Unit' {
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
    $script:publicKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
    )
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  Context 'When the configured trust anchor exists' {
    It 'Should return the validated public key' {
      $path = Join-Path $TestDrive 'approver.pub'
      Set-Content -LiteralPath $path -Value $script:publicKey
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          WorkstationApproverPublicKeyPath = $path
        }
      }

      $result = InModuleScope -Parameters @{ Context = $context } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevWorkstationApproverPublicKey -Context $Context
      }

      $result | Should-BeString -Expected $script:publicKey -CaseSensitive
    }
  }

  Context 'When the configured trust anchor is malformed' {
    It 'Should reject it' {
      $path = Join-Path $TestDrive 'malformed.pub'
      Set-Content -LiteralPath $path -Value 'ssh-ed25519 QQ=='
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          WorkstationApproverPublicKeyPath = $path
        }
      }

      {
        InModuleScope -Parameters @{ Context = $context } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevWorkstationApproverPublicKey -Context $Context
        }
      } | Should-Throw -ExceptionMessage '*public-key file is invalid*'
    }
  }
}
