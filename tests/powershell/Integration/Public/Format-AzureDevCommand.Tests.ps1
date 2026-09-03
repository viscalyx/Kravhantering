#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe 'Format-AzureDevCommand' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Logging'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When combined credentials cross the exported module boundary' {
    It 'Should return one completely redacted command string' {
      $password = "password first line`npassword second line`n"
      $clientSecret = "client first line`nclient second line`n"
      $authKey = "auth first line`r`nauth second line`n"

      $formatted = Format-AzureDevCommand `
        -FilePath 'az' `
        -Arguments @(
          'login',
          "--password=$password",
          "--client-secret=$clientSecret",
          "--auth-key=$authKey"
        )

      $formatted | Should-BeString `
        -CaseSensitive `
        -Expected (
          'az login --password=[redacted] --client-secret=[redacted] ' +
          '--auth-key=[redacted]'
        )
      $formatted | Should-NotMatchString 'password first line'
      $formatted | Should-NotMatchString 'client first line'
      $formatted | Should-NotMatchString 'auth first line'
    }
  }
}
