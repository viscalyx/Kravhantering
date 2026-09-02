#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Get-AzureDevLifecycleConfig' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Config'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    $script:subscriptionItem = Get-Item `
      Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
      -ErrorAction SilentlyContinue
    Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
      'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
  }

  AfterAll {
    Remove-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
      -ErrorAction SilentlyContinue
    if ($null -ne $script:subscriptionItem) {
      Set-Item `
        Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        $script:subscriptionItem.Value
    }
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When loading an isolated repository configuration' {
    It 'Should return the public immutable lifecycle snapshot contract' {
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development') `
        -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=integration-rg
AZURE_DEV_VM_NAME=integration-vm
'@

      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName status `
        -RepositoryRoot $TestDrive

      $snapshot.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleConfigurationSnapshot'
      $snapshot.SubscriptionId |
        Should-Be 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      $snapshot.ResourceGroup | Should-Be 'integration-rg'
      $snapshot.VmName | Should-Be 'integration-vm'
      @($snapshot.Keys) |
        Should-NotContainCollection 'SshHostAlias'
    }
  }
}
