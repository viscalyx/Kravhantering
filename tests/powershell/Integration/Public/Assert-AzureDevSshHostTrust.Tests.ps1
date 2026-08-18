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
  'Assert-AzureDevSshHostTrust' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Ssh'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the setup context records authenticated host trust' {
    It 'Should accept the context across the module boundary' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
      }

      $null = Assert-AzureDevSshHostTrust -Context $context
    }
  }

  Context 'When the setup context has no authenticated host trust' {
    It 'Should reject the context across the module boundary' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $false
      }

      {
        Assert-AzureDevSshHostTrust -Context $context
      } | Should-Throw -ExceptionMessage (
        '*Authenticated SSH host trust has not been established*'
      )
    }
  }
}
