#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Remove-AzureDevWorkstation' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Workstation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($modulePath in @(
      'scripts/azure-dev/AzureDev.Config.psm1',
      'scripts/azure-dev/AzureDev.Logging.psm1',
      'scripts/azure-dev/AzureDev.Azure.psm1',
      'scripts/azure-dev/AzureDev.Ssh.psm1',
      'scripts/azure-dev/AzureDev.Workstation.psm1'
    )) {
      Import-Module (
        Join-Path $script:repositoryRoot $modulePath
      ) -Force -ErrorAction Stop
    }
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }

    Mock -CommandName Test-AzureDevPrerequisites
    Mock -CommandName ConvertTo-AzureDevAccessName -MockWith { return $Value }
    Mock -CommandName Get-AzureDevSshAccessRules
    Mock -CommandName Confirm-AzureDevWorkstationAction -MockWith { return $true }
    Mock -CommandName Get-AzureDevPublicIpAddress -MockWith {
      return '203.0.113.10'
    }
    Mock -CommandName Wait-AzureDevSsh
    Mock -CommandName Remove-AzureDevRemoteWorkstationKey
    Mock -CommandName Remove-AzureDevSshAccessRule

    $script:context = [System.Management.Automation.PSObject]@{
      Config = [System.Management.Automation.PSObject]@{
        SshHostName = ''
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    foreach ($moduleName in @(
      'AzureDev.Ssh',
      'AzureDev.Azure',
      'AzureDev.Logging',
      'AzureDev.Config'
    )) {
      Get-Module $moduleName -All | Remove-Module -Force
    }
  }

  Context 'When the manager configuration has no persisted SSH host name' {
    It 'Should resolve the live public IP before establishing host trust' {
      $null = Remove-AzureDevWorkstation `
        -Context $script:context `
        -WorkstationName 'developer-laptop' `
        -Confirm:$false

      Should-Invoke `
        -CommandName Get-AzureDevPublicIpAddress `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Config -eq $script:context.Config }
      Should-Invoke `
        -CommandName Wait-AzureDevSsh `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Context -eq $script:context -and
          $HostName -eq '203.0.113.10'
        }
      Should-Invoke `
        -CommandName Remove-AzureDevRemoteWorkstationKey `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
