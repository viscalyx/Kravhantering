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
      'Should-NotInvoke:ModuleName' = $script:moduleName
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

  Context 'When ssh-keygen cannot remove a managed entry' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
        if ($FilePath -eq 'ssh-keygen') {
          return [System.Management.Automation.PSObject]@{
            ExitCode = 1
            Text = 'failed'
          }
        }
        throw "Unexpected native command: $FilePath"
      }
    }

    It 'Should fail without replacing the known-hosts file' {
      $original = Get-Content -LiteralPath $script:knownHostsPath -Raw

      {
        InModuleScope `
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
      } | Should-Throw -ExceptionMessage (
        '*Could not update managed SSH host trust*'
      )

      (Get-Content -LiteralPath $script:knownHostsPath -Raw) |
        Should-BeString -Expected $original -CaseSensitive
    }
  }

  Context 'When ssh-keygen creates its backup file' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
        if ($FilePath -eq 'ssh-keygen') {
          $fileOption = [System.Array]::IndexOf($Arguments, '-f')
          $path = [System.String]$Arguments[$fileOption + 1]
          [System.IO.File]::WriteAllText("$path.old", 'backup')
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

    It 'Should remove the backup after installing authenticated trust' {
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

      @(Get-ChildItem -LiteralPath $TestDrive -Filter '*.old').Count |
        Should-Be 0
    }
  }

  Context 'When WhatIf is requested' {
    It 'Should not create or replace managed trust files' {
      $directory = Join-Path $TestDrive 'whatif'
      $script:context.Config.SshKnownHostsPath = Join-Path `
        $directory `
        'known_hosts'

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
            -HostKeys @($TrustedHostKey) `
            -WhatIf
        }

      (Test-Path -LiteralPath $directory) | Should-BeFalse
      Should-NotInvoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -Scope It
    }
  }
}
