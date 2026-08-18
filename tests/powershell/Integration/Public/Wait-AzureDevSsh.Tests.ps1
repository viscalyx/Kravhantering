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
  'Wait-AzureDevSsh' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
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
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      if ($FilePath -eq 'ssh') {
        return [System.Management.Automation.PSObject]@{
          ExitCode = 0
          Text = ''
        }
      }
      $mockOutput = & $FilePath @Arguments 2>&1
      return [System.Management.Automation.PSObject]@{
        ExitCode = $LASTEXITCODE
        Text = ($mockOutput | Out-String)
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  Context 'When replacing hashed managed host entries' {
    BeforeEach {
      $script:knownHostsPath = Join-Path $TestDrive 'known_hosts'
      $script:oldHostKey = (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAINHTPpE1LHuzHN/oirKpSYd7H/LfaLu0H1gp8VOcBt1y'
      )
      Set-Content -LiteralPath $script:knownHostsPath -Value @(
        "krav-test $script:oldHostKey"
        "203.0.113.10 $script:oldHostKey"
        "unrelated.example $script:trustedHostKey"
      )
      & ssh-keygen -H -f $script:knownHostsPath | Out-Null
      Remove-Item -LiteralPath "$script:knownHostsPath.old" -Force

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

    }

    It 'Should preserve unrelated hashed trust while installing Azure evidence' {
      $result = Wait-AzureDevSsh `
        -Context $script:context `
        -HostName '203.0.113.10' `
        -TimeoutSeconds 1

      $result | Should-BeTrue
      $aliasLookup = & ssh-keygen `
        -F 'krav-test' `
        -f $script:knownHostsPath
      $hostLookup = & ssh-keygen `
        -F '203.0.113.10' `
        -f $script:knownHostsPath
      $unrelatedLookup = & ssh-keygen `
        -F 'unrelated.example' `
        -f $script:knownHostsPath
      (($aliasLookup -join "`n") -like "*$script:trustedHostKey*") |
        Should-BeTrue
      (($hostLookup -join "`n") -like "*$script:trustedHostKey*") |
        Should-BeTrue
      (($aliasLookup -join "`n") -like "*$script:oldHostKey*") |
        Should-BeFalse
      (($hostLookup -join "`n") -like "*$script:oldHostKey*") |
        Should-BeFalse
      (($unrelatedLookup -join "`n") -like "*$script:trustedHostKey*") |
        Should-BeTrue
    }
  }
}
