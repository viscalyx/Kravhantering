#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevManagedWorkstationApprovalIdentity' -Tag 'Unit' {
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

  Context 'When the managed key pair exists' {
    It 'Should return its public key and fingerprint' {
      $privateKeyPath = Join-Path $TestDrive 'approver'
      $publicKeyPath = "$privateKeyPath.pub"
      Set-Content -LiteralPath $privateKeyPath -Value 'private fixture'
      Set-Content -LiteralPath $publicKeyPath -Value $script:publicKey
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          SshPrivateKeyPath = $privateKeyPath
          SshPublicKeyPath = $publicKeyPath
        }
      }

      $result = InModuleScope -Parameters @{ Context = $context } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevManagedWorkstationApprovalIdentity -Context $Context
      }

      $result.PublicKey |
        Should-BeString -Expected $script:publicKey -CaseSensitive
      $result.Fingerprint |
        Should-BeString `
          -Expected 'SHA256:H8XbXBwELOKEATfqIAkkv78p9jn9xCtjmv6WPECWYw0' `
          -CaseSensitive
    }
  }
}
