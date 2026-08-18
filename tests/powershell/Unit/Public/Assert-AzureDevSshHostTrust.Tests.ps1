#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Assert-AzureDevSshHostTrust' -Tag 'Unit' {
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

  Context 'When authenticated host trust is established' {
    It 'Should allow remote work to continue' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $true
      }

      $null = Assert-AzureDevSshHostTrust -Context $context
    }
  }

  Context 'When authenticated host trust is absent' {
    It 'Should stop before remote work' {
      $context = [System.Management.Automation.PSObject]@{
        SshHostTrustEstablished = $false
      }

      {
        Assert-AzureDevSshHostTrust -Context $context
      } | Should-Throw -ExceptionMessage (
        '*authenticated SSH host trust has not been established*'
      )
    }
  }
}
