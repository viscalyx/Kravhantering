#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Wait-AzureDevSsh' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Ssh'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $script:trustedHostKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop

    Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
      return [System.Management.Automation.PSObject]@{
        value = @(
          New-Object -TypeName System.Management.Automation.PSObject -Property @{
            code = 'ComponentStatus/StdOut/succeeded'
            message = (
              'ssh-ed25519 ' +
              'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
            )
          }
        )
      }
    }
  }

  BeforeEach {
    $script:knownHostsPath = Join-Path $TestDrive 'known_hosts'
    Set-Content -LiteralPath $script:knownHostsPath -Value (
      'unrelated.example ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIEZzZWVkZWQtdW5yZWxhdGVkLWtleS0xMjM0NTY3ODkw'
    )
    $script:context = [System.Management.Automation.PSObject]@{
      SshHostTrustEstablished = $false
      Config = [System.Management.Automation.PSObject]@{
        ResourceGroup = 'rg-test'
        SubscriptionId = '00000000-0000-0000-0000-000000000000'
        VmName = 'vm-test'
        SshHostAlias = 'krav-test'
        SshKnownHostsPath = $script:knownHostsPath
        SshHostKeyArguments = [System.Object[]]@(
          '-o',
          'StrictHostKeyChecking=yes',
          '-o',
          "UserKnownHostsFile=$script:knownHostsPath",
          '-o',
          'GlobalKnownHostsFile=none',
          '-o',
          'KnownHostsCommand=none',
          '-o',
          'VerifyHostKeyDNS=no',
          '-o',
          'UpdateHostKeys=no'
        )
      }
    }
    $script:mockSshArguments = $null
    $script:mockSshResults =
      [System.Collections.Generic.Queue[System.Object]]::new()
    $script:mockSshResults.Enqueue(
      [System.Management.Automation.PSObject]@{
        ExitCode = 0
        Text = ''
      }
    )
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      if ($FilePath -eq 'ssh-keygen') {
        $target = [System.String]$Arguments[1]
        $fileOption = [System.Array]::IndexOf($Arguments, '-f')
        $path = [System.String]$Arguments[$fileOption + 1]
        $remaining = @(
          Get-Content -LiteralPath $path |
            Where-Object {
              $hostField = @($_ -split '[ \t]+', 2)[0]
              $target -notin @($hostField -split ',')
            }
        )
        Set-Content -LiteralPath $path -Value $remaining
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
      if ($FilePath -eq 'ssh') {
        $script:mockSshArguments = @($Arguments)
        return $script:mockSshResults.Dequeue()
      }
      throw "Unexpected native command: $FilePath"
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  Context 'When the VM has no managed host trust yet' {
    It 'Should pin Azure control-plane evidence before the first SSH connection' {
      $result = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 1

      $result | Should-BeTrue
      $script:context.SshHostTrustEstablished | Should-BeTrue
      $knownHosts = Get-Content -LiteralPath $script:knownHostsPath
      ($knownHosts -contains "krav-test $script:trustedHostKey") |
        Should-BeTrue
      ($knownHosts -contains "203.0.113.10 $script:trustedHostKey") |
        Should-BeTrue
      (
        $knownHosts -contains (
          'unrelated.example ssh-ed25519 ' +
          'AAAAC3NzaC1lZDI1NTE5AAAAIEZzZWVkZWQtdW5yZWxhdGVkLWtleS0xMjM0NTY3ODkw'
        )
      ) | Should-BeTrue
      ($script:mockSshArguments -contains 'StrictHostKeyChecking=yes') |
        Should-BeTrue
      ($script:mockSshArguments -notcontains 'StrictHostKeyChecking=accept-new') |
        Should-BeTrue
      ($script:mockSshArguments -contains 'KnownHostsCommand=none') |
        Should-BeTrue
      ($script:mockSshArguments -contains 'VerifyHostKeyDNS=no') |
        Should-BeTrue
      Should-Invoke `
        -CommandName Invoke-AzureDevHostKeyRunCommand `
        -Exactly `
        -Times 1 `
        -Scope It
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }

  Context 'When unrelated trust has no trailing newline' {
    BeforeEach {
      Set-Content `
        -LiteralPath $script:knownHostsPath `
        -Value (
          'unrelated.example ssh-ed25519 ' +
          'AAAAC3NzaC1lZDI1NTE5AAAAIEZzZWVkZWQtdW5yZWxhdGVkLWtleS0xMjM0NTY3ODkw'
        ) `
        -NoNewline
    }

    It 'Should separate authenticated entries without changing unrelated trust' {
      $null = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 1

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
    }
  }

  Context 'When the installed host key already matches Azure evidence' {
    It 'Should retain one matching entry for each managed host name' {
      Add-Content -LiteralPath $script:knownHostsPath -Value @(
        "krav-test $script:trustedHostKey"
        "203.0.113.10 $script:trustedHostKey"
      )

      $result = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 1

      $result | Should-BeTrue
      $knownHosts = @(Get-Content -LiteralPath $script:knownHostsPath)
      @($knownHosts | Where-Object {
          $_ -ceq "krav-test $script:trustedHostKey"
        }).Count | Should-Be 1
      @($knownHosts | Where-Object {
          $_ -ceq "203.0.113.10 $script:trustedHostKey"
        }).Count | Should-Be 1
    }
  }

  Context 'When the network presents a different host key' {
    BeforeEach {
      $script:mockSshResults.Clear()
      $script:mockSshResults.Enqueue(
        [System.Management.Automation.PSObject]@{
          ExitCode = 255
          Text = 'REMOTE HOST IDENTIFICATION HAS CHANGED'
        }
      )
    }

    It 'Should fail without accepting or retrying the mismatched key' {
      {
        Wait-AzureDevSsh `
          -Context $script:context `
          -HostName '203.0.113.10' `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage (
        '*mismatch against Azure control-plane evidence*'
      )

      ($script:mockSshArguments -contains 'StrictHostKeyChecking=yes') |
        Should-BeTrue
      ($script:mockSshArguments -notcontains 'StrictHostKeyChecking=accept-new') |
        Should-BeTrue
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Exactly `
        -Times 1 `
        -Scope It
      $script:context.SshHostTrustEstablished | Should-BeFalse
    }
  }

  Context 'When Azure host-key evidence is unavailable' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        throw 'VM agent unavailable'
      }
    }

    It 'Should fail before opening an SSH connection' {
      {
        Wait-AzureDevSsh `
          -Context $script:context `
          -HostName '203.0.113.10' `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key retrieval failed*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Scope It
      $script:context.SshHostTrustEstablished | Should-BeFalse
    }
  }

  Context 'When Azure host-key evidence becomes available before the deadline' {
    BeforeAll {
      $script:mockEvidenceAttempts = 0
      Mock -CommandName Start-Sleep
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        $script:mockEvidenceAttempts++
        if ($script:mockEvidenceAttempts -eq 1) {
          throw 'VM agent starting'
        }
        return [System.Management.Automation.PSObject]@{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = (
                'ssh-ed25519 ' +
                'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
              )
            }
          )
        }
      }
    }

    It 'Should retry before making the first SSH connection' {
      $result = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 30

      $result | Should-BeTrue
      $script:context.SshHostTrustEstablished | Should-BeTrue
      Should-Invoke `
        -CommandName Invoke-AzureDevHostKeyRunCommand `
        -Exactly `
        -Times 2 `
        -Scope It
      Should-Invoke -CommandName Start-Sleep -Exactly -Times 1 -Scope It
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }

  Context 'When Azure host-key evidence is malformed' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return [System.Management.Automation.PSObject]@{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = 'ssh-ed25519 QQ=='
            }
          )
        }
      }
    }

    It 'Should reject the evidence before opening an SSH connection' {
      {
        Wait-AzureDevSsh `
          -Context $script:context `
          -HostName '203.0.113.10' `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key evidence was malformed*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Scope It
      $script:context.SshHostTrustEstablished | Should-BeFalse
    }
  }

  Context 'When the resolved host name is empty' {
    It 'Should fail before retrieving evidence or opening SSH' {
      {
        Wait-AzureDevSsh `
          -Context $script:context `
          -HostName '  ' `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage '*resolved VM host is required*'

      Should-NotInvoke `
        -CommandName Invoke-AzureDevHostKeyRunCommand `
        -Scope It
      Should-NotInvoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -ParameterFilter { $FilePath -eq 'ssh' } `
        -Scope It
      $script:context.SshHostTrustEstablished | Should-BeFalse
    }
  }

  Context 'When Azure authenticates a legitimate replacement host key' {
    It 'Should replace only the managed host entries' {
      $oldHostKey = (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAINHTPpE1LHuzHN/oirKpSYd7H/LfaLu0H1gp8VOcBt1y'
      )
      Add-Content -LiteralPath $script:knownHostsPath -Value @(
        "krav-test $oldHostKey"
        "203.0.113.10 $oldHostKey"
      )

      $result = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 1

      $result | Should-BeTrue
      $knownHosts = @(Get-Content -LiteralPath $script:knownHostsPath)
      ($knownHosts -contains "krav-test $script:trustedHostKey") |
        Should-BeTrue
      ($knownHosts -contains "203.0.113.10 $script:trustedHostKey") |
        Should-BeTrue
      ($knownHosts -contains "krav-test $oldHostKey") | Should-BeFalse
      ($knownHosts -contains "203.0.113.10 $oldHostKey") | Should-BeFalse
      ($knownHosts[0] -like 'unrelated.example *') | Should-BeTrue
    }
  }
}
