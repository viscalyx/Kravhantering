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

    It 'Should redact hyphenated combined secret flags across multiple lines' {
      $clientSecret = "client first line`nclient last line"
      $authKey = "auth first line`r`nauth last line"

      $formatted = Format-AzureDevCommand `
        -FilePath 'az' `
        -Arguments @(
          'login',
          "--client-secret=$clientSecret",
          "--auth-key=$authKey"
        )

      $formatted | Should-BeString `
        -CaseSensitive `
        -Expected (
          'az login --client-secret=[redacted] --auth-key=[redacted]'
        )
      $formatted | Should-NotMatchString 'client first line'
      $formatted | Should-NotMatchString 'client last line'
      $formatted | Should-NotMatchString 'auth first line'
      $formatted | Should-NotMatchString 'auth last line'
    }

    It 'Should redact every supported split and assignment spelling' {
      $secret = "split first line`nsplit last line"
      $assignmentSecret = "assigned first line`r`nassigned last line"

      $formatted = Format-AzureDevCommand `
        -FilePath 'az' `
        -Arguments @(
          'login',
          '--client_secret', $secret,
          '--CLIENTSecret', $secret,
          '--client-secret', $secret,
          '--auth_key', $secret,
          '--AUTHKey', $secret,
          '--auth-key', $secret,
          '--admin-password', $secret,
          "--client_secret=$assignmentSecret",
          "--CLIENTSecret=$assignmentSecret",
          "--client-secret=$assignmentSecret",
          "--auth_key=$assignmentSecret",
          "--AUTHKey=$assignmentSecret",
          "--auth-key=$assignmentSecret",
          "KEYCLOAK_ADMIN_PASSWORD=$assignmentSecret"
        )

      $formatted | Should-BeString `
        -CaseSensitive `
        -Expected (
          'az login --client_secret [redacted] --CLIENTSecret [redacted] ' +
          '--client-secret [redacted] --auth_key [redacted] ' +
          '--AUTHKey [redacted] --auth-key [redacted] ' +
          '--admin-password [redacted] ' +
          '--client_secret=[redacted] --CLIENTSecret=[redacted] ' +
          '--client-secret=[redacted] --auth_key=[redacted] ' +
          '--AUTHKey=[redacted] --auth-key=[redacted] ' +
          'KEYCLOAK_ADMIN_PASSWORD=[redacted]'
        )
      $formatted | Should-NotMatchString 'split first line'
      $formatted | Should-NotMatchString 'split last line'
      $formatted | Should-NotMatchString 'assigned first line'
      $formatted | Should-NotMatchString 'assigned last line'
    }
  }
}
