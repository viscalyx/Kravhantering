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
  'Invoke-AzureDevRemoteCommand' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Bootstrap'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Bootstrap.psm1'
    ) -Force -ErrorAction Stop
  }

  BeforeEach {
    $script:originalPath = $env:PATH
    $fakeSshPath = Join-Path $TestDrive 'ssh'
    $null = New-Item `
      -ItemType SymbolicLink `
      -Path $fakeSshPath `
      -Target '/bin/echo'
    $env:PATH = "$TestDrive$([System.IO.Path]::PathSeparator)$env:PATH"
  }

  AfterEach {
    $env:PATH = $script:originalPath
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the remote process returns output' {
    It 'Should preserve native output for the caller' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
        }
      }

      $result = Invoke-AzureDevRemoteCommand `
        -Context $context `
        -Command 'bootstrap-command' `
        -PassThru

      $result.Contains('bootstrap-command') | Should-BeTrue
    }
  }
}
