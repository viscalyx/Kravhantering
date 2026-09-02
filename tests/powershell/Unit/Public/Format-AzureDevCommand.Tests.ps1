#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Format-AzureDevCommand' -Tag 'Unit' {
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

  Context 'When Azure CLI uses a combined password argument' {
    It 'Should redact the complete secret before formatting command text' {
      $secret = "first secret line`n--tenant decoy-value`r`nlast secret line`n"

      $formatted = Format-AzureDevCommand `
        -FilePath 'az' `
        -Arguments @(
          'login',
          '--service-principal',
          ('--password=' + $secret),
          '--tenant',
          '22222222-2222-2222-2222-222222222222'
        )

      $formatted | Should-MatchString '--password=\[redacted\]'
      $formatted | Should-NotMatchString (
        [System.Text.RegularExpressions.Regex]::Escape($secret)
      )
      $formatted | Should-NotMatchString 'first secret line'
      $formatted | Should-NotMatchString 'last secret line'
      $formatted | Should-NotMatchString 'decoy-value'
    }
  }
}
