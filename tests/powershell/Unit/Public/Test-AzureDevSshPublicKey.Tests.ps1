#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevSshPublicKey' -Tag 'Unit' {
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

  Context 'When validating an SSH public key wire blob' {
    It 'Should accept a structurally valid key' {
      $publicKey = (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      )

      $result = Test-AzureDevSshPublicKey -Value $publicKey

      $result | Should-BeTrue
    }

    It 'Should reject Base64 without an SSH wire-format key' {
      $result = Test-AzureDevSshPublicKey -Value 'ssh-ed25519 QQ=='

      $result | Should-BeFalse
    }

    It 'Should reject a blob whose embedded algorithm does not match' {
      $rsaLabelWithEd25519Blob = (
        'ssh-rsa ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      )

      $result = Test-AzureDevSshPublicKey -Value $rsaLabelWithEd25519Blob

      $result | Should-BeFalse
    }
  }
}
