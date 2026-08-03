#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe `
  'Test-AzureDevSshPublicKey' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
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

  Context 'When the exported validator receives complete key text' {
    It 'Should accept a complete Ed25519 public key' {
      $publicKey = (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      )

      $result = Test-AzureDevSshPublicKey -Value $publicKey

      $result | Should-BeTrue
    }

    It 'Should reject an Ed25519 blob with an unusable key field' {
      $result = Test-AzureDevSshPublicKey `
        -Value 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAAUE='

      $result | Should-BeFalse
    }
  }
}
