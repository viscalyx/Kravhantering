#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Set-AzureDevKnownHostTrust' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Ssh'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
    $script:trustedHostKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
    )

    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      if ($FilePath -eq 'ssh-keygen') {
        return [System.Management.Automation.PSObject]@{
          ExitCode = 0
          Text = ''
        }
      }
      if ($FilePath -eq 'chmod') {
        return [System.Management.Automation.PSObject]@{
          ExitCode = 0
          Text = ''
        }
      }
      throw "Unexpected native command: $FilePath"
    }
  }

  BeforeEach {
    $script:knownHostsPath = Join-Path $TestDrive 'known_hosts'
    Set-Content `
      -LiteralPath $script:knownHostsPath `
      -Value (
        'unrelated.example ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIEZzZWVkZWQtdW5yZWxhdGVkLWtleS0xMjM0NTY3ODkw'
      ) `
      -NoNewline
    $script:context = [System.Management.Automation.PSObject]@{
      Config = [System.Management.Automation.PSObject]@{
        SshHostAlias = 'krav-test'
        SshKnownHostsPath = $script:knownHostsPath
      }
    }

  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When unrelated trust lacks a trailing newline' {
    It 'Should preserve it as a separate entry while installing both names' {
      $null = InModuleScope `
        -Parameters @{
          Context = $script:context
          TrustedHostKey = $script:trustedHostKey
        } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Set-AzureDevKnownHostTrust `
            -Context $Context `
            -HostName '203.0.113.10' `
            -HostKeys @($TrustedHostKey)
        }

      $knownHosts = Get-Content -LiteralPath $script:knownHostsPath
      $knownHosts.Count | Should-Be 3
      $knownHosts[0] | Should-BeString `
        -Expected (
          'unrelated.example ssh-ed25519 ' +
          'AAAAC3NzaC1lZDI1NTE5AAAAIEZzZWVkZWQtdW5yZWxhdGVkLWtleS0xMjM0NTY3ODkw'
        ) `
        -CaseSensitive
      $knownHosts[1] |
        Should-BeString `
          -Expected "krav-test $script:trustedHostKey" `
          -CaseSensitive
      $knownHosts[2] |
        Should-BeString `
          -Expected "203.0.113.10 $script:trustedHostKey" `
          -CaseSensitive
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh-keygen' } `
        -Exactly `
        -Times 2 `
        -Scope It
    }
  }
}
