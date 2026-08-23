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
  'Invoke-AzureDevSmokeValidation' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Validation'
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
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Validation.psm1'
    ) -Force -ErrorAction Stop
  }

  BeforeEach {
    $script:originalPath = $env:PATH
    $fakeSshPath = Join-Path $TestDrive 'ssh'
    $null = New-Item `
      -ItemType SymbolicLink `
      -Path $fakeSshPath `
      -Target '/bin/false'
    $env:PATH = "$TestDrive$([System.IO.Path]::PathSeparator)$env:PATH"
  }

  AfterEach {
    $env:PATH = $script:originalPath
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Bootstrap' -All | Remove-Module -Force
    Get-Module 'AzureDev.Ssh' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the isolated remote boundary fails' {
    It 'Should report the native failure through the public command' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
        Config = [System.Management.Automation.PSObject]@{
          SshHostAlias = 'krav-test'
          SshHostKeyArguments = [System.Object[]]@()
          GitUserName = 'Ada Admin'
          GitUserEmail = 'ada@example.test'
          GitSshSigningPublicKey = ''
        }
      }

      {
        Invoke-AzureDevSmokeValidation `
          -Context $context `
          -ExpectedCodexVersion '1.2.3'
      } | Should-Throw -ExceptionMessage (
        '*Azure VM smoke validation failed*'
      )
    }
  }
}
