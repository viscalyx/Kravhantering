#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevHostKeyRunCommand' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Ssh'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop

    Mock -CommandName Invoke-AzCli -MockWith {
      return [System.Management.Automation.PSObject]@{ value = @() }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When host-key evidence is requested' {
    It 'Should read only public host keys through authenticated Run Command' {
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          SubscriptionId = '00000000-0000-0000-0000-000000000000'
          ResourceGroup = 'rg-test'
          VmName = 'vm-test'
        }
      }

      $null = InModuleScope -Parameters @{ Context = $context } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevHostKeyRunCommand -Context $Context
      }

      Should-Invoke `
        -CommandName Invoke-AzCli `
        -ParameterFilter {
          $Json -and
          ($Arguments -join ' ') -like '*vm run-command invoke*' -and
          ($Arguments -contains '00000000-0000-0000-0000-000000000000') -and
          ($Arguments -contains 'rg-test') -and
          ($Arguments -contains 'vm-test') -and
          ($Arguments -contains 'RunShellScript') -and
          ($Arguments -join ' ') -like '*/etc/ssh/ssh_host_*_key.pub*'
        } `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
